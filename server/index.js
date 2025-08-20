/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2025 Caleb Stephens (csteph9@gmail.com)
 * See the LICENSE file in the project root for license information.
 */

import express from 'express';
import session from 'express-session';
import cors from 'cors';
import morgan from 'morgan';
import { pool } from './db.js'
import { Parser } from 'expr-eval'
import _ from 'lodash'
import PDFDocument from 'pdfkit'
import { spawn } from 'child_process'
import multer from 'multer'
import fs from 'fs'
import os from 'os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ejs from 'ejs'
const upload = multer({ dest: os.tmpdir() })

const lodashTemplate = _.template


const app = express();
const PORT = process.env.PORT || 3001;

const parser = new Parser({ operators: { logical: true, comparison: true, ternary: true } })
parser.functions.clamp = (x, lo, hi) => Math.min(Math.max(Number(x), Number(lo)), Number(hi))
parser.functions.min = Math.min
parser.functions.max = Math.max
parser.functions.round = (x, d=0) => {
  const p = Math.pow(10, d|0); return Math.round(Number(x)*p)/p
}

app.use(morgan('dev'));
app.use(express.json());
app.use(cors({
  origin: 'http://localhost:5173', // Vite default
  credentials: true,
}));

app.use(
  session({
    secret: 'for-use-with-local-docker-only',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8h
  })
);

// Seed a default admin session for local dev
app.use((req, _res, next) => {
  if (!req.session.user) {
    req.session.user = {
      id: 1,
      username: 'admin',
      role: 'admin',
      displayName: 'Local Admin',
    };
  }
  next();
});



const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)
const publicDir  = path.join(__dirname, 'public')
app.use(express.static(publicDir))
app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'))
})


app.get('/api/me', (req, res) => {
  res.json({ user: req.session.user });
});

// Example placeholder (future): minimal users list
app.get('/api/users', (_req, res) => {
  res.json([{ id: 1, username: 'admin', role: 'admin' }]);
});

app.listen(PORT, () => {
  console.log(`API running on http://127.0.0.1:${PORT}`);
});


// --- helpers (drop near top, reuse in calc route too) ---
const pad2 = (n) => String(n).padStart(2, '0')

// Accepts Date OR string. Returns a Date (UTC midnight) or null.
function toUtcDate(input) {
  if (!input) return null
  if (input instanceof Date) {
    // normalize to UTC midnight (no time component)
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()))
  }
  const s = String(input)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T00:00:00Z`)
  }
  const d = new Date(s)
  if (isNaN(d.getTime())) return null
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function addDays(d, n) { return new Date(d.getTime() + n * 86400000) }
function ymd(d) { return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth()+1)}-${pad2(d.getUTCDate())}` }

function periodStartFor(dateInput, frequency, anchorStartInput) {
  const d = toUtcDate(dateInput)
  if (!d) return '0000-01-01'  // safe fallback avoids NaN-NaN-01

  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() // 0..11
  const day = d.getUTCDay() // 0..6 (Sun..Sat)

  switch ((frequency || 'Monthly').toLowerCase()) {
    case 'annual':
      return `${y}-01-01`
    case 'quarterly': {
      const qStartMonth = [0,3,6,9][Math.floor(m / 3)]
      return `${y}-${pad2(qStartMonth+1)}-01`
    }
    case 'semi-annual': {
      const startM = m < 6 ? 0 : 6
      return `${y}-${pad2(startM+1)}-01`
    }
    case 'weekly': {
      // ISO-like: Monday start
      const delta = (day === 0 ? -6 : 1 - day)
      return ymd(addDays(d, delta))
    }
    case 'bi-weekly': {
      const anchor = toUtcDate(anchorStartInput) || d
      const daysSince = Math.floor((d.getTime() - anchor.getTime()) / 86400000)
      const idx = Math.floor(daysSince / 14)
      const start = addDays(anchor, idx * 14)
      return ymd(start)
    }
    case 'monthly':
    default:
      return `${y}-${pad2(m+1)}-01`
  }
}


app.post('/api/participants', async (req, res) => {
  try {
    const {
      firstName, lastName, email, employeeId,
      managerParticipantId = null, effectiveStart = null, effectiveEnd = null
    } = req.body

    const [result] = await pool.execute(
      `INSERT INTO plan_participant
       (first_name, last_name, email, employee_id, manager_participant_id, effective_start, effective_end)
       VALUES (:firstName, :lastName, :email, :employeeId, :managerParticipantId, :effectiveStart, :effectiveEnd)`,
      { firstName, lastName, email, employeeId, managerParticipantId, effectiveStart, effectiveEnd }
    )
    res.status(201).json({ id: result.insertId })
  } catch (err) {
    console.error(err)
    res.status(400).json({ error: 'Failed to create participant', detail: err.message })
  }
})

// helpers
const toDateStr = (v) => (v ? String(v).slice(0, 10) : null);
const safeLabel = (v) => (v == null ? null : String(v).slice(0, 120));

app.put('/api/plans/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

  const {
    name, version, payoutFrequency, effectiveStart, effectiveEnd, description,
    payoutPeriods   // expected: [{ start, end, label }]
  } = req.body || {};

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) Update the plan itself
    await conn.execute(
      `UPDATE comp_plan
         SET name = ?, version = ?, payout_frequency = ?,
             effective_start = ?, effective_end = ?, description = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        name ?? null,
        (version || '1.0'),
        payoutFrequency || null,
        toDateStr(effectiveStart),
        toDateStr(effectiveEnd),
        description || null,
        id,
      ]
    );

    // 2) If payoutPeriods was provided, replace them
    let periodsUpdated = 0;

    if (Array.isArray(payoutPeriods)) {
      await conn.execute('DELETE FROM plan_payout_period WHERE plan_id = ?', [id]);

      const cleaned = payoutPeriods
        .map(p => ({
          start: toDateStr(p?.start ?? p?.start_date ?? p?.startDate),
          end:   toDateStr(p?.end   ?? p?.end_date   ?? p?.endDate),
          label: safeLabel(p?.label),
        }))
        .filter(p => p.start && p.end);

      if (cleaned.length) {
        const values = cleaned.map(() => '(?,?,?,?)').join(',');
        const params = [];
        cleaned.forEach(p => params.push(id, p.start, p.end, p.label));
        await conn.execute(
          `INSERT INTO plan_payout_period
             (plan_id, start_date, end_date, label)
           VALUES ${values}`,
          params
        );
        periodsUpdated = cleaned.length;
      }
    }

    await conn.commit(); conn.release();
    res.json({ ok: true, periodsUpdated });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    conn.release();
    res.status(500).json({ error: 'Failed to update plan', detail: e.message });
  }
});

// GET /api/plans/:id/periods
app.get('/api/plans/:id/periods', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' })

  const conn = await pool.getConnection()
  try {
    const [rows] = await conn.execute(
      `SELECT id, start_date AS start, end_date AS end, label
         FROM plan_payout_period
        WHERE plan_id = ?
        ORDER BY start_date ASC`,
      [id]
    )
    conn.release()
    res.json({ periods: rows })
  } catch (e) {
    conn.release()
    res.status(500).json({ error: 'Failed to load periods', detail: e.message })
  }
})

// LIST plans
app.get('/api/plans', async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, version, effective_start AS effectiveStart, payout_frequency AS payoutFrequency,
              effective_end AS effectiveEnd, description, created_at AS createdAt
       FROM comp_plan
       ORDER BY created_at DESC`
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch plans' })
  }
})

// GET plan with elements
app.get('/api/plans/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const [[plan]] = await pool.execute(
      `SELECT id, name, version, effective_start AS effectiveStart, payout_frequency AS payoutFrequency,
              effective_end AS effectiveEnd, description, created_at AS createdAt
       FROM comp_plan WHERE id = :id`,
      { id }
    )
    if (!plan) return res.status(404).json({ error: 'Plan not found' })

    const [elements] = await pool.execute(
      `SELECT pe.id,
              ed.id AS elementDefinitionId,
              ed.name,ed.formula, ed.notes,
              pe.created_at AS createdAt
       FROM plan_element pe
       JOIN element_definition ed ON ed.id = pe.element_definition_id
       WHERE pe.plan_id = :id
       ORDER BY pe.created_at ASC`,
      { id }
    )
    res.json({ plan, elements })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch plan detail' })
  }
})

// UPDATE plan
app.put('/api/plans/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { name, version, payoutFrequency, effectiveStart, effectiveEnd, description } = req.body



    await pool.execute(
      `UPDATE comp_plan
       SET name = :name,
           version = :version,
           payout_frequency = :payoutFrequency,
           effective_start = :effectiveStart,
           effective_end = :effectiveEnd,
           description = :description
       WHERE id = :id`,
      { id, name, version, payoutFrequency, effectiveStart, effectiveEnd, description }
    )
    res.status(204).end()
  } catch (err) {
    console.error(err)
    res.status(400).json({ error: 'Failed to update plan', detail: err.message })
  }
})


// DELETE a plan (will auto-detach elements via FK ON DELETE CASCADE)
app.delete('/api/plans/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    await pool.execute('DELETE FROM comp_plan WHERE id = :id', { id })
    return res.status(204).end()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to delete plan', detail: err.message })
  }
})


const FORBIDDEN = /\b(globalThis|global|process|require|module|exports|Function|eval|constructor|__proto__|child_process|fs|import)\b/
const nameRegex = /^[A-Za-z_][A-Za-z0-9_]*$/

function validateFormulaSyntax(code) {
  const src = String(code || '').trim()
  if (!src) return
  if (FORBIDDEN.test(src)) {
    const err = new Error('Forbidden token in formula'); err.code = 'FORBIDDEN'; throw err
  }
  const hasReturn = /\breturn\b/.test(src)
  // looks like statements? (const/let/var OR semicolon OR newline)
  const looksMulti = /\b(?:const|let|var)\b/.test(src) || /;|\n/.test(src)
  if (!hasReturn && looksMulti) {
    const err = new Error('Multi-line formulas must include an explicit `return ...`')
    err.code = 'NO_RETURN'
    throw err
  }
  const body = hasReturn ? src : `return (${src});`
  // eslint-disable-next-line no-new-func
  new Function('sum','avg','min','max','count','clamp','period','participantId','planId', `"use strict"; ${body}`)
}


app.get('/api/participants', async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id,
              first_name AS firstName,
              last_name  AS lastName,
              email,
              employee_id AS employeeId,
              created_at AS createdAt
       FROM plan_participant
       ORDER BY created_at DESC`
    )
    res.json(rows)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to fetch participants' })
  }
})

// GET participant + attached plans
app.get('/api/participants/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const [[participant]] = await pool.execute(
      `SELECT id,
              first_name AS firstName,
              last_name  AS lastName,
              email, employee_id AS employeeId,
              manager_participant_id AS managerParticipantId,
              effective_start AS effectiveStart,
              effective_end   AS effectiveEnd,
              created_at AS createdAt
       FROM plan_participant WHERE id = :id`, { id }
    )
    if (!participant) return res.status(404).json({ error: 'Participant not found' })

    const [plans] = await pool.execute(
      `SELECT pp.id,
              cp.id AS planId,
              cp.name, cp.version,
              cp.effective_start AS planEffectiveStart,
              cp.effective_end   AS planEffectiveEnd,
              pp.effective_start AS assignmentEffectiveStart,
              pp.effective_end   AS assignmentEffectiveEnd,
              pp.created_at      AS attachedAt
       FROM participant_plan pp
       JOIN comp_plan cp ON cp.id = pp.plan_id
       WHERE pp.participant_id = :id
       ORDER BY pp.created_at DESC`, { id }
    )

    res.json({ participant, plans })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to fetch participant detail' })
  }
})


// ATTACH plan to participant
app.post('/api/participants/:id/plans', async (req, res) => {
  try {
    const participantId = Number(req.params.id)
    const { planId, effectiveStart = null, effectiveEnd = null } = req.body
    await pool.execute(
      `INSERT INTO participant_plan (participant_id, plan_id, effective_start, effective_end)
       VALUES (:participantId, :planId, :effectiveStart, :effectiveEnd)`,
      { participantId, planId, effectiveStart, effectiveEnd }
    )
    res.status(201).json({ ok: true })
  } catch (e) {
    // duplicate assignment
    if (e?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Plan already attached' })
    console.error(e)
    res.status(400).json({ error: 'Failed to attach plan', detail: e.message })
  }
})


// DETACH plan from participant
app.delete('/api/participants/:participantId/plans/:participantPlanId', async (req, res) => {
  try {
    const participantId = Number(req.params.participantId)
    const participantPlanId = Number(req.params.participantPlanId)
    await pool.execute(
      `DELETE FROM participant_plan WHERE id = :participantPlanId AND participant_id = :participantId`,
      { participantId, participantPlanId }
    )
    res.status(204).end()
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to detach plan', detail: e.message })
  }
})


// LIST metrics (optional filters)
app.get('/api/metrics', async (req, res) => {
  try {
    const { participantId, elementDefinitionId, from, to } = req.query
    const where = []
    const params = {}
    if (participantId) { where.push('pev.participant_id = :participantId'); params.participantId = Number(participantId) }
    if (elementDefinitionId) { where.push('pev.element_definition_id = :elementDefinitionId'); params.elementDefinitionId = Number(elementDefinitionId) }
    if (from) { where.push('pev.metric_date >= :from'); params.from = from }
    if (to) { where.push('pev.metric_date <= :to'); params.to = to }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const [rows] = await pool.execute(
      `SELECT
         pev.id, pev.metric_date AS metricDate, pev.value,
         p.id AS participantId, p.first_name AS firstName, p.last_name AS lastName,
         ed.id AS elementDefinitionId, ed.name AS elementName, ed.element_type AS elementType, ed.unit
       FROM participant_element_value pev
       JOIN plan_participant p ON p.id = pev.participant_id
       JOIN element_definition ed ON ed.id = pev.element_definition_id
       ${whereSql}
       ORDER BY pev.metric_date DESC, pev.id DESC`,
      params
    )
    res.json(rows)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to fetch metrics' })
  }
})

// CREATE a metric (insert or upsert by unique key)
app.post('/api/metrics', async (req, res) => {
  try {
    const { participantId, elementDefinitionId, metricDate, value } = req.body
    await pool.execute(
      `INSERT INTO participant_element_value
         (participant_id, element_definition_id, metric_date, value)
       VALUES (:participantId, :elementDefinitionId, :metricDate, :value)
       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = CURRENT_TIMESTAMP`,
      { participantId, elementDefinitionId, metricDate, value }
    )
    res.status(201).json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: 'Failed to save metric', detail: e.message })
  }
})

// DELETE a metric row
app.delete('/api/metrics/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    await pool.execute('DELETE FROM participant_element_value WHERE id = :id', { id })
    res.status(204).end()
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to delete metric', detail: e.message })
  }
})


// BULK UPSERT metrics from CSV text
app.post('/api/metrics/bulk', async (req, res) => {
  try {
    const { csv, hasHeader = false } = req.body
    if (!csv || typeof csv !== 'string') {
      return res.status(400).json({ error: 'Missing csv string in body' })
    }

    // Very simple CSV parsing (no quotes/escapes). One row per line, comma-delimited.
    const lines = csv
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0)

    let start = 0
    if (hasHeader) start = 1 // skip the first line

    // Collect unique participant ids and element names for lookups
    const rows = []
    const participantIds = new Set()
    const elementNames = new Set()

    for (let i = start; i < lines.length; i++) {
      const raw = lines[i]
      const parts = raw.split(',').map(s => s.trim())
      if (parts.length < 4) {
        rows.push({ line: i + 1, raw, status: 'error', message: 'Expected 4 columns' })
        continue
      }
      const [participantIdStr, elementName, metricDate, valueStr] = parts
      const participantId = Number(participantIdStr)
      const value = Number(valueStr)

      rows.push({ line: i + 1, raw, participantId, elementName, metricDate, value, status: 'pending' })
      if (!Number.isNaN(participantId)) participantIds.add(participantId)
      if (elementName) elementNames.add(elementName)
    }

    if (rows.length === 0) return res.json({ total: 0, inserted: 0, updated: 0, errors: [] })

    // Lookup participants that exist
    const [participants] = await pool.execute(
      `SELECT id FROM plan_participant WHERE id IN (${[...participantIds].map((_,i)=>`:p${i}`).join(',')})`,
      Object.fromEntries([...participantIds].map((v,i)=>[`p${i}`, v]))
    )
    const participantSet = new Set(participants.map(p => p.id))

    // Lookup element definitions by NAME (element code)
    const nameParams = Object.fromEntries([...elementNames].map((v,i)=>[`n${i}`, v]))
    const [elements] = await pool.execute(
      `SELECT id, name FROM element_definition WHERE name IN (${[...elementNames].map((_,i)=>`:n${i}`).join(',')})`,
      nameParams
    )
    const elementByName = new Map(elements.map(e => [e.name, e.id]))

    // Prepare values to insert
    const good = []
    const errors = []
    for (const r of rows) {
      if (r.status === 'error') { errors.push(r); continue }
      if (!participantSet.has(r.participantId)) {
        errors.push({ line: r.line, raw: r.raw, status: 'error', message: `Unknown participant_id ${r.participantId}` })
        continue
      }
      const edId = elementByName.get(r.elementName)
      if (!edId) {
        errors.push({ line: r.line, raw: r.raw, status: 'error', message: `Unknown element name '${r.elementName}'` })
        continue
      }
      if (!r.metricDate || !/^\d{4}-\d{2}-\d{2}$/.test(r.metricDate)) {
        errors.push({ line: r.line, raw: r.raw, status: 'error', message: `Bad date '${r.metricDate}', expected YYYY-MM-DD` })
        continue
      }
      if (Number.isNaN(r.value)) {
        errors.push({ line: r.line, raw: r.raw, status: 'error', message: `Bad number value '${r.value}'` })
        continue
      }
      good.push([r.participantId, edId, r.metricDate, r.value])
    }

    if (good.length === 0) {
      return res.status(400).json({ total: rows.length, inserted: 0, updated: 0, errors })
    }

    // Batch insert with upsert
    // unique key is (participant_id, element_definition_id, metric_date)
    const valuesSql = good.map((_, i) => `(:p${i}, :e${i}, :d${i}, :v${i})`).join(',')
    const params = {}
    good.forEach((row, i) => {
      params[`p${i}`] = row[0]
      params[`e${i}`] = row[1]
      params[`d${i}`] = row[2]
      params[`v${i}`] = row[3]
    })

    const [result] = await pool.execute(
      `INSERT INTO participant_element_value (participant_id, element_definition_id, metric_date, value)
       VALUES ${valuesSql}
       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = CURRENT_TIMESTAMP`,
      params
    )
    // mysql2 doesn't always split inserted vs updated cleanly; report counts heuristically
    const affected = result.affectedRows || 0
    // For ON DUP KEY, each upsert can affect 1 (insert) or 2 (update). We can’t know exact split without extra work.
    // Return totals + errors; UI can show summary.
    return res.json({
      total: rows.length,
      processed: good.length,
      affected,
      errors
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Bulk import failed', detail: e.message })
  }
})


//ADD NEW PLAN
app.post('/api/plans', async (req, res) => {
  const {
    name,
    version,
    payoutFrequency,
    effectiveStart,
    effectiveEnd,
    description,
    payoutPeriods, // [{ start, end, label }]
  } = req.body || {};

  if (!name) return res.status(400).json({ error: 'Name is required' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [planIns] = await conn.execute(
      `INSERT INTO comp_plan
         (name, version, payout_frequency, effective_start, effective_end, description, created_at, updated_at)
       VALUES (?,    ?,       ?,                ?,               ?,          ?,          NOW(),     NOW())`,
      [
        name ?? null,
        (version || '1.0'),
        payoutFrequency || null,
        toDateStr(effectiveStart),
        toDateStr(effectiveEnd),
        description || null,
      ]
    );
    const planId = planIns.insertId;

    // Insert payout periods if provided
    const rows = Array.isArray(payoutPeriods) ? payoutPeriods : [];
    const cleaned = rows
      .map((p) => ({
        start: toDateStr(p?.start),
        end: toDateStr(p?.end),
        label: safeLabel(p?.label),
      }))
      .filter((p) => p.start && p.end);

    if (cleaned.length) {
      // Optional sanity: ensure start <= end and (light) ordering
      for (const p of cleaned) {
        if (p.end < p.start) {
          throw new Error(`Payout period has end before start (${p.start} > ${p.end})`);
        }
      }
      const values = cleaned.map(() => '(?,?,?,?,?)').join(',');
      const params = [];
      cleaned.forEach((p) => {
        params.push(planId, p.start, p.end, p.label, new Date()); // created_at handled by NOW(); updated_at by trigger
      });

      // Use NOW() on server side for timestamps
      await conn.execute(
        `INSERT INTO plan_payout_period
           (plan_id, start_date, end_date, label, created_at)
         VALUES ${values}`,
        params
      );
      // MariaDB/MySQL will auto-fill updated_at default
    }

    await conn.commit();
    conn.release();
    res.status(201).json({ id: planId, periodsInserted: cleaned.length });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    conn.release();
    res.status(500).json({ error: 'Failed to create plan', detail: e.message });
  }
});


app.post('/api/plans/:id/calculate', async (req, res) => {
  const planId = Number(req.params.id)
  const triggeredBy = req.session?.user?.username || 'admin'
  if (!Number.isFinite(planId)) return res.status(400).json({ error: 'Invalid plan id' })

  // ---------- helpers ----------
  const toDate = (s) => new Date(String(s).slice(0,10) + 'T00:00:00Z')
  const ymd = (d) => {
    const pad = (n)=>String(n).padStart(2,'0')
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`
  }
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

  // safe-ish formula guard (blocks obvious escapes; keep simple on purpose)
  const FORBIDDEN = /\b(globalThis|global|process|require|module|exports|Function|eval|constructor|__proto__|child_process|fs|import)\b/
  const makeFormulaFn = (code, argNames) => {
    const src = String(code || '').trim()
    if (!src) return null
    if (FORBIDDEN.test(src)) throw new Error('Forbidden token in formula')
    // Support expression or block-with-return
    const body = /\breturn\b/.test(src) ? src : `return (${src});`
    // eslint-disable-next-line no-new-func
    return new Function(...argNames, `"use strict"; ${body}`)
  }

  // Aggregators exposed to formulas
  const agg = {
    sum: (arr) => (Array.isArray(arr) ? arr.reduce((a,b)=>a+num(b),0) : 0),
    avg: (arr) => (Array.isArray(arr)&&arr.length ? arr.reduce((a,b)=>a+num(b),0)/arr.length : 0),
    min: (arr) => (Array.isArray(arr)&&arr.length ? Math.min(...arr.map(num)) : 0),
    max: (arr) => (Array.isArray(arr)&&arr.length ? Math.max(...arr.map(num)) : 0),
    count: (arr)=> (Array.isArray(arr) ? arr.length : 0),
    clamp: (x,lo,hi)=> Math.min(Math.max(num(x), num(lo)), num(hi)),
  }

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    // ---------- 0) plan + periods ----------
    const [[plan]] = await conn.execute(
      `SELECT id, payout_frequency AS payoutFrequency,
              effective_start AS effectiveStart, effective_end AS effectiveEnd
         FROM comp_plan WHERE id = :planId`,
      { planId }
    )
    if (!plan) {
      await conn.rollback(); conn.release()
      return res.status(404).json({ error: 'Plan not found' })
    }

    const [periods] = await conn.execute(
      `SELECT id, start_date AS start, end_date AS end, label
         FROM plan_payout_period
        WHERE plan_id = :planId
        ORDER BY start_date ASC`,
      { planId }
    )
    if (!periods.length) {
      await conn.rollback(); conn.release()
      return res.status(400).json({ error: 'No payout periods defined for this plan' })
    }

    // ---------- 1) reset run ----------
    await conn.execute(`DELETE FROM plan_calculation_run WHERE plan_id = :planId`, { planId })
    const [runIns] = await conn.execute(
      `INSERT INTO plan_calculation_run (plan_id, triggered_by) VALUES (:planId, :triggeredBy)`,
      { planId, triggeredBy }
    )
    const runId = runIns.insertId

    // ---------- 2) participants assigned ----------
    const [participants] = await conn.execute(
      `SELECT DISTINCT participant_id AS participantId
         FROM participant_plan
        WHERE plan_id = :planId`,
      { planId }
    )
    if (!participants.length) {
      await conn.commit(); conn.release()
      return res.json({ runId, rows: 0, totals: { participants: 0, elements: 0, periods: 0, totalComputed: 0 } })
    }
    const pIds = participants.map(x=>x.participantId)
    const pParams = Object.fromEntries(pIds.map((v,i)=>[`p${i}`, v]))

    // ---------- 3) plan elements + formulas ----------
    const [elements] = await conn.execute(
      `SELECT ed.id AS elementDefinitionId,
              ed.name AS elementName,
              ed.unit AS unit,
              ed.rate AS rate,
              ed.formula AS formulaJS,          -- use this column for JS
              ed.formula_id AS formulaId,
              ed.formula_params AS formulaParams
         FROM plan_element pe
         JOIN element_definition ed ON ed.id = pe.element_definition_id
        WHERE pe.plan_id = :planId`,
      { planId }
    )
    if (!elements.length) {
      await conn.commit(); conn.release()
      return res.json({ runId, rows: 0, totals: { participants: participants.length, elements: 0, periods: periods.length, totalComputed: 0 } })
    }

    // Ensure element variable names are valid JS identifiers
    const validIdent = /^[A-Za-z_][A-Za-z0-9_]*$/
    for (const e of elements) {
      if (!validIdent.test(e.elementName)) {
        await conn.rollback(); conn.release()
        return res.status(400).json({ error: `Invalid element name for JS context: ${e.elementName}` })
      }
    }

    // ---------- 4) pull all actuals within assignment ∩ plan periods ----------
    const minStart = periods[0].start
    const maxEnd   = periods[periods.length - 1].end

    const eIds = elements.map(e=>e.elementDefinitionId)
    const eParams = Object.fromEntries(eIds.map((v,i)=>[`e${i}`, v]))

    const [actuals] = await conn.execute(
      `SELECT pev.participant_id AS participantId,
              pev.element_definition_id AS elementDefinitionId,
              pev.metric_date AS metricDate,
              pev.value AS value
         FROM participant_element_value pev
         JOIN participant_plan pp
           ON pp.participant_id = pev.participant_id
          AND pp.plan_id = :planId
        WHERE pev.participant_id IN (${pIds.map((_,i)=>`:p${i}`).join(',')})
          AND pev.element_definition_id IN (${eIds.map((_,i)=>`:e${i}`).join(',')})
          AND pev.metric_date >= COALESCE(pp.effective_start, :minStart, '0001-01-01')
          AND pev.metric_date <= COALESCE(pp.effective_end,   :maxEnd,   '9999-12-31')
          AND pev.metric_date BETWEEN :minStart AND :maxEnd
        ORDER BY pev.metric_date ASC`,
      { ...pParams, ...eParams, planId, minStart, maxEnd }
    )

    // Index actuals by participant + element (sorted by date already)
    const byPE = new Map() // key `${p}:${e}` -> [{metricDate, value}]
    for (const r of actuals) {
      const key = `${r.participantId}:${r.elementDefinitionId}`
      if (!byPE.has(key)) byPE.set(key, [])
      byPE.get(key).push({ metricDate: r.metricDate, value: num(r.value) })
    }

    // Build a name -> elementDefinitionId map for fast lookups
    const idByName = Object.fromEntries(elements.map(e => [e.elementName, e.elementDefinitionId]))
    const elemsById = Object.fromEntries(elements.map(e => [e.elementDefinitionId, e]))

    // ---------- 5) evaluate per participant × period × element ----------
    const rowsOut = []
    let totalComputed = 0
    let evaluatedElements = 0

    // Prepare formula compilers per element (only once)
    const elementArgNames = [
      'sum','avg','min','max','count','clamp',   // helpers
      'period','participantId','planId',         // metadata
      // then each element variable by name (NEW_ARR, RETAIN_NR, ...)
      ...elements.map(e => e.elementName)
    ]
    const compiled = new Map() // elementId -> compiled function or null

    for (const e of elements) {
      let fn = null
      if (e.formulaJS && String(e.formulaJS).trim()) {
        try {
          fn = makeFormulaFn(e.formulaJS, elementArgNames)
          console.log(fn);
        } catch (err) {
          // If compilation fails, treat as no-op (0) but keep going
          fn = null
        }
      }
      compiled.set(e.elementDefinitionId, fn)
    }

    // Helper: build the JS argument list for one participant+period
    const buildArgsFor = (participantId, period) => {
      // Each element becomes an object with { value: number[], rows: [{date,value}] } scoped to this period
      const elementVars = elements.map(e => {
        const series = byPE.get(`${participantId}:${e.elementDefinitionId}`) || []
        const start = toDate(period.start), end = toDate(period.end)
        const scoped = series.filter(r => r.metricDate >= period.start && r.metricDate <= period.end)
        return {
          value: scoped.map(r => r.value),
          rows: scoped.map(r => ({ date: r.metricDate, value: r.value })),
        }
      })
      return [
        agg.sum, agg.avg, agg.min, agg.max, agg.count, agg.clamp,
        { start: period.start, end: period.end, label: period.label ?? null },
        participantId, planId,
        ...elementVars
      ]
    }

    for (const p of participants) {
      const participantId = p.participantId
      for (const period of periods) {
        // Build context args once per participant×period
        const args = buildArgsFor(participantId, period)

        for (const e of elements) {
          const fn = compiled.get(e.elementDefinitionId)
          let computed = 0
          if (fn) {
            try {
              const out = fn(...args)
              computed = num(out)
            } catch {
              computed = 0
            }
          } else {
            // default: sum of own values this period (if no formula provided)
            const idx = elementArgNames.indexOf(e.elementName)
            const varObj = args[idx] // position matches argNames
            computed = agg.sum(varObj?.value || [])
          }

          // Only record if there is any activity (or always? choose to record all)
          // Here: record all elements for all periods so totals align
          rowsOut.push({
            runId,
            planId,
            participantId,
            elementDefinitionId: e.elementDefinitionId,
            metricDate: period.end,        // use period end as the "date" of the computed row
            inputValue: null,              // not meaningful in this model
            rate: e.rate != null ? Number(e.rate) : null,
            formula: e.formulaJS || null,
            computedValue: computed
          })
          totalComputed += computed
        }
      }
    }

    evaluatedElements = elements.length

    // ---------- 6) insert results ----------
    if (rowsOut.length) {
      const CHUNK = 500
      for (let i = 0; i < rowsOut.length; i += CHUNK) {
        const slice = rowsOut.slice(i, i + CHUNK)
        const valuesSql = slice.map((_, j) =>
          `(:run${i+j}, :plan${i+j}, :prt${i+j}, :elem${i+j}, :date${i+j}, :in${i+j}, :rate${i+j}, :fml${i+j}, :cmp${i+j})`
        ).join(',')
        const params = {}
        slice.forEach((rr, k) => {
          const n = i + k
          params[`run${n}`]=rr.runId
          params[`plan${n}`]=rr.planId
          params[`prt${n}`]=rr.participantId
          params[`elem${n}`]=rr.elementDefinitionId
          params[`date${n}`]=rr.metricDate
          params[`in${n}`]=rr.inputValue
          params[`rate${n}`]=rr.rate
          params[`fml${n}`]=rr.formula
          params[`cmp${n}`]=rr.computedValue
        })
        await conn.execute(
          `INSERT INTO plan_calculation_result
             (run_id, plan_id, participant_id, element_definition_id, metric_date,
              input_value, rate, formula, computed_value)
           VALUES ${valuesSql}`,
          params
        )
      }
    }

    // ---------- 7) update run totals ----------
    await conn.execute(
      `UPDATE plan_calculation_run SET totals_json = :tj WHERE id = :runId`,
      {
        runId,
        tj: JSON.stringify({
          participants: participants.length,
          elements: evaluatedElements,
          periods: periods.length,
          rows: rowsOut.length,
          totalComputed
        })
      }
    )

    await conn.commit(); conn.release()
    res.json({ runId, rows: rowsOut.length, totals: { participants: participants.length, elements: evaluatedElements, periods: periods.length, totalComputed } })
  } catch (e) {
    try { await conn.rollback() } catch {}
    conn.release()
    console.error(e)
    res.status(500).json({ error: 'Calculation failed', detail: e.message })
  }
})


// Fetch latest calc results for a plan (flattened)
app.get('/api/plans/:id/calculations', async (req, res) => {
  try {
    const planId = Number(req.params.id)
    // latest run id
    const [[run]] = await pool.execute(
      `SELECT id, run_at AS runAt, totals_json AS totals
       FROM plan_calculation_run
       WHERE plan_id = :planId
       ORDER BY run_at DESC
       LIMIT 1`,
      { planId }
    )
    if (!run) return res.json({ run: null, results: [] })

    const [rows] = await pool.execute(
      `SELECT r.id, r.participant_id AS participantId, p.first_name AS firstName, p.last_name AS lastName,
              r.element_definition_id AS elementDefinitionId, ed.name AS elementName, ed.element_type AS elementType, ed.unit,
              r.metric_date AS metricDate, r.input_value AS inputValue, r.rate, r.formula, r.computed_value AS computedValue
       FROM plan_calculation_result r
       JOIN plan_participant p ON p.id = r.participant_id
       JOIN element_definition ed ON ed.id = r.element_definition_id
       WHERE r.run_id = :runId
       ORDER BY p.last_name, p.first_name, r.metric_date, ed.name`,
      { runId: run.id }
    )
    res.json({ run, results: rows })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to load calculations' })
  }
})

// --- API: Participant payout summary (by plan, by period) ---
app.get('/api/participants/:id/payout-summary', async (req, res) => {
  const participantId = Number(req.params.id)
  const conn = await pool.getConnection()
  try {
    // Pull all result rows for this participant, with plan details and run timestamp
    const [rows] = await conn.execute(
      `SELECT
         p.id            AS planId,
         p.name          AS planName,
         p.version       AS planVersion,
         p.payout_frequency AS payoutFrequency,
         p.effective_start  AS planStart,
         p.effective_end    AS planEnd,
         r.id            AS runId,
         r.created_at    AS runAt,
         r.plan_id       AS runPlanId,
         r.totals_json   AS runTotals,
         pr.metric_date  AS metricDate,
         pr.computed_value AS computedValue
       FROM plan_calculation_result pr
       JOIN plan_calculation_run r ON r.id = pr.run_id
       JOIN comp_plan p             ON p.id = r.plan_id
       WHERE pr.participant_id = :participantId
       ORDER BY p.id, pr.metric_date ASC, r.created_at DESC`,
      { participantId }
    )

    // Bucket by plan -> periodStart -> sum, also track latest run per plan/period
    const byPlan = new Map()
    for (const r of rows) {
      const planKey = r.planId
      if (!byPlan.has(planKey)) {
        byPlan.set(planKey, {
          planId: r.planId,
          planName: r.planName,
          planVersion: r.planVersion,
          payoutFrequency: r.payoutFrequency || 'Monthly',
          planStart: r.planStart,
          planEnd: r.planEnd,
          periods: new Map() // periodStart -> { total, lastRunAt, lastRunId }
        })
      }
      const plan = byPlan.get(planKey)
      const period = periodStartFor(r.metricDate, plan.payoutFrequency, plan.planStart)
      if (!plan.periods.has(period)) {
        plan.periods.set(period, { total: 0, lastRunAt: r.runAt, lastRunId: r.runId })
      }
      const bucket = plan.periods.get(period)
      const v = Number(r.computedValue ?? 0)
      bucket.total = (bucket.total ?? 0) + (Number.isFinite(v) ? v : 0)
      // keep most recent run timestamp for the period
      if (r.runAt > bucket.lastRunAt) {
        bucket.lastRunAt = r.runAt
        bucket.lastRunId = r.runId
      }
    }

    // Shape final JSON
    const result = []
    for (const plan of byPlan.values()) {
      const periodsArr = [...plan.periods.entries()]
      .sort((a,b) => a[0] < b[0] ? 1 : -1)
      .map(([periodStart, v]) => {
        const total = Number.isFinite(v.total) ? v.total : 0
        return {
          periodStart,
          total: Math.round(total * 100) / 100,   // round to 2dp
          runId: v.lastRunId
        }
      })
      result.push({
        planId: plan.planId,
        planName: plan.planName,
        planVersion: plan.planVersion,
        payoutFrequency: plan.payoutFrequency,
        planStart: plan.planStart,
        planEnd: plan.planEnd,
        periods: periodsArr
      })
    }

    // Sort plans by most recent period first
    result.sort((a,b) => {
      const aLatest = a.periods[0]?.periodStart || '0000-00-00'
      const bLatest = b.periods[0]?.periodStart || '0000-00-00'
      return aLatest < bLatest ? 1 : -1
    })

    res.json(result)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to load payout summary', detail: e.message })
  } finally {
    conn.release()
  }
})


// GET: results for a single run and participant, with period keys
app.get('/api/runs/:runId/participants/:participantId/results', async (req, res) => {
  const runId = Number(req.params.runId)
  const participantId = Number(req.params.participantId)
  const conn = await pool.getConnection()
  try {
    // plan metadata (for payout frequency + dates)
    const [[plan]] = await conn.execute(
      `SELECT p.id AS planId, p.name AS planName, p.version AS planVersion,
              p.payout_frequency AS payoutFrequency,
              p.effective_start AS planStart,
              p.effective_end   AS planEnd
         FROM plan_calculation_run r
         JOIN comp_plan p ON p.id = r.plan_id
        WHERE r.id = :runId`,
      { runId }
    )
    if (!plan) { conn.release(); return res.status(404).json({ error: 'Run not found' }) }

    const [rows] = await conn.execute(
      `SELECT
          pr.metric_date          AS metricDate,
          pr.input_value          AS inputValue,
          pr.rate                 AS rate,
          pr.formula              AS formula,
          pr.computed_value       AS computedValue,
          pr.element_definition_id AS elementId,
          ed.name                 AS elementName,
          ed.unit                 AS unit
       FROM plan_calculation_result pr
       JOIN element_definition ed ON ed.id = pr.element_definition_id
      WHERE pr.run_id = :runId AND pr.participant_id = :participantId
      ORDER BY pr.metric_date ASC, ed.name ASC`,
      { runId, participantId }
    )

    // Bucket by payout period, and also sum per element in that period
    const periods = new Map() // periodStart -> { total, items: [rows], byElement: Map }
    for (const r of rows) {
      const period = periodStartFor(r.metricDate, plan.payoutFrequency, plan.planStart)
      if (!periods.has(period)) periods.set(period, { total: 0, items: [], byElement: new Map() })
      const bucket = periods.get(period)

      const computed = Number(r.computedValue ?? 0)
      bucket.total += Number.isFinite(computed) ? computed : 0
      bucket.items.push({
        metricDate: r.metricDate,
        elementId: r.elementId,
        elementName: r.elementName,
        unit: r.unit,
        inputValue: Number(r.inputValue ?? 0),
        rate: r.rate,
        formula: r.formula,
        computedValue: Number.isFinite(computed) ? computed : 0
      })

      const k = r.elementId
      const prev = bucket.byElement.get(k) || { elementId: k, elementName: r.elementName, total: 0 }
      prev.total += Number.isFinite(computed) ? computed : 0
      bucket.byElement.set(k, prev)
    }

    const result = {
      plan,
      participantId,
      runId,
      periods: [...periods.entries()]
        .sort((a,b) => a[0] < b[0] ? 1 : -1) // newest first
        .map(([periodStart, v]) => ({
          periodStart,
          total: Math.round((v.total || 0) * 100) / 100,
          byElement: [...v.byElement.values()]
            .map(e => ({ ...e, total: Math.round(e.total * 100)/100 }))
            .sort((a,b) => b.total - a.total),
          items: v.items // raw rows if you want detail drill-down per line
        }))
    }

    res.json(result)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to load run detail', detail: e.message })
  } finally {
    conn.release()
  }
})


app.put('/api/participants/:id', async (req, res) => {
  const id = Number(req.params.id)
  const conn = await pool.getConnection()
  const {
    firstName, lastName, email, employeeId,
    managerParticipantId, effectiveStart, effectiveEnd
  } = req.body

  // Normalize to YYYY-MM-DD if strings/ISO come in
  const toDate = v => (v ? String(v).slice(0, 10) : null)

  await conn.execute(
    `UPDATE plan_participant
       SET first_name = ?, last_name = ?, email = ?,
           manager_participant_id = ?, effective_start = ?, effective_end = ?, updated_at = NOW()
     WHERE id = ?`,
    [
      firstName ?? null,
      lastName ?? null,
      email ?? null,
      managerParticipantId ?? null,
      toDate(effectiveStart),
      toDate(effectiveEnd),
      id,
    ]
  )

  // Return the updated record (optional)
  const [updated] = await conn.execute('SELECT * FROM plan_participant WHERE id = ?', [id])
  res.json({ participant: updated })
})


// DELETE /api/participants/:id
app.delete('/api/participants/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' })

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    // Delete dependents first (per your tables)
    await conn.execute('DELETE FROM plan_calculation_result WHERE participant_id = ?', [id])
    await conn.execute('DELETE FROM participant_element_value WHERE participant_id = ?', [id])
    await conn.execute('DELETE FROM participant_plan WHERE participant_id = ?', [id])

    // Then delete the participant record
    const [result] = await conn.execute('DELETE FROM plan_participant WHERE id = ?', [id])
    if (result.affectedRows === 0) {
      await conn.rollback(); conn.release()
      return res.status(404).json({ error: 'Not found' })
    }

    await conn.commit(); conn.release()
    res.json({ ok: true, id })
  } catch (e) {
    try { await conn.rollback() } catch {}
    conn.release()
    const code = e?.errno || e?.code
    if (code === 1451 || code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({
        error: 'Cannot delete: participant is referenced by other records.',
        detail: e?.sqlMessage || 'Foreign key constraint failed.',
      })
    }
    res.status(500).json({ error: 'Delete failed', detail: e?.message })
  }
})



// --- validators ---
//const nameRegex = /^[A-Za-z_][A-Za-z0-9_]*$/
const isValidScope = (v) => v === 'payout' || v === 'plan'

// Optional: soft validation using lodash.template if available
//let lodashTemplate = null
try {
  // Works with CommonJS or ESM transpiled default
  const _ = (await import('lodash-es').catch(() => null)) || (await import('lodash').catch(() => null))
  if (_) lodashTemplate = _.template
} catch { /* ignore */ }

function validateLodashTemplateMaybe(tpl) {
  const src = (tpl ?? '').toString()
  if (!src.trim()) return
  if (lodashTemplate) {
    // Minimal settings; lodash has sensible defaults, this is just to be explicit
    lodashTemplate(src) // throws on syntax error
  } else {
    // No lodash available: do a super-lightweight sanity check (never throws on plain text)
    // Accept if it has tags like <% ... %> or is plain text
    // If you want stricter validation, install lodash(-es) on the server.
    return
  }
}

// ---------- COMPUTATIONS CRUD ----------

// List
app.get('/api/computations', async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, scope, template,
              created_at AS createdAt, updated_at AS updatedAt
         FROM computation_definition
        ORDER BY name ASC`
    )
    res.json({ computations: rows })
  } catch (e) {
    res.status(500).json({ error: 'Failed to list computations', detail: e.message })
  }
})

// Read one
app.get('/api/computations/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' })
  try {
    const [[row]] = await pool.execute(
      `SELECT id, name, scope, template,
              created_at AS createdAt, updated_at AS updatedAt
         FROM computation_definition
        WHERE id = ?`,
      [id]
    )
    if (!row) return res.status(404).json({ error: 'Not found' })
    res.json({ computation: row })
  } catch (e) {
    res.status(500).json({ error: 'Failed to load computation', detail: e.message })
  }
})

// Create
app.post('/api/computations', async (req, res) => {
  const { name, scope, template } = req.body || {}
  if (!name || !nameRegex.test(name)) {
    return res.status(400).json({ error: 'Invalid name. Use letters/numbers/underscore; cannot start with a number.' })
  }
  const scopeVal = isValidScope(scope) ? scope : 'payout'
  try { validateLodashTemplateMaybe(template) }
  catch (e) { return res.status(422).json({ error: 'Invalid lodash template', detail: e.message }) }

  try {
    const [ins] = await pool.execute(
      `INSERT INTO computation_definition (name, scope, template)
       VALUES (?, ?, ?)`,
      [name, scopeVal, template || null]
    )
    res.status(201).json({ id: ins.insertId, name, scope: scopeVal })
  } catch (e) {
    if (e?.errno === 1062) return res.status(409).json({ error: 'Computation name already exists' })
    res.status(500).json({ error: 'Failed to create computation', detail: e.message })
  }
})

// Update
app.put('/api/computations/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' })

  const { name, scope, template } = req.body || {}
  if (name !== undefined && !nameRegex.test(name)) {
    return res.status(400).json({ error: 'Invalid name' })
  }
  if (scope !== undefined && !isValidScope(scope)) {
    return res.status(400).json({ error: 'Invalid scope (use "payout" or "plan")' })
  }
  try { if (template !== undefined) validateLodashTemplateMaybe(template) }
  catch (e) { return res.status(422).json({ error: 'Invalid lodash template', detail: e.message }) }

  const sets = [], params = []
  if (name !== undefined)     { sets.push('name = ?');     params.push(name) }
  if (scope !== undefined)    { sets.push('scope = ?');    params.push(scope) }
  if (template !== undefined) { sets.push('template = ?'); params.push(template || null) }
  if (!sets.length) return res.json({ ok: true, updated: 0 })
  params.push(id)

  try {
    const [r] = await pool.execute(
      `UPDATE computation_definition
          SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      params
    )
    res.json({ ok: true, updated: r.affectedRows })
  } catch (e) {
    if (e?.errno === 1062) return res.status(409).json({ error: 'Computation name already exists' })
    res.status(500).json({ error: 'Failed to update computation', detail: e.message })
  }
})

// Delete
app.delete('/api/computations/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' })
  try {
    const [r] = await pool.execute(`DELETE FROM computation_definition WHERE id = ?`, [id])
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true, removed: r.affectedRows })
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete computation', detail: e.message })
  }
})


// Attach a computation to a plan
app.post('/api/plans/:id/computations', async (req, res) => {
  const planId = Number(req.params.id)
  const { computationId } = req.body || {}
  if (!Number.isFinite(planId) || !Number.isFinite(Number(computationId))) {
    return res.status(400).json({ error: 'Invalid plan or computation id' })
  }
  try {
    await pool.execute(
      `INSERT IGNORE INTO plan_computation (plan_id, computation_id) VALUES (?, ?)`,
      [planId, Number(computationId)]
    )
    res.status(201).json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: 'Failed to attach computation', detail: e.message })
  }
})

// Detach a computation from a plan
app.delete('/api/plans/:id/computations/:compId', async (req, res) => {
  const planId = Number(req.params.id)
  const compId = Number(req.params.compId)
  if (!Number.isFinite(planId) || !Number.isFinite(compId)) {
    return res.status(400).json({ error: 'Invalid ids' })
  }
  try {
    const [r] = await pool.execute(
      `DELETE FROM plan_computation WHERE plan_id = ? AND computation_id = ?`,
      [planId, compId]
    )
    res.json({ ok: true, removed: r.affectedRows })
  } catch (e) {
    res.status(500).json({ error: 'Failed to detach computation', detail: e.message })
  }
})

// List computations attached to a plan
app.get('/api/plans/:id/computations', async (req, res) => {
  const planId = Number(req.params.id)
  if (!Number.isFinite(planId)) return res.status(400).json({ error: 'Invalid plan id' })
  try {
    const [rows] = await pool.execute(
      `SELECT c.id, c.name, c.scope, c.template,
              c.created_at AS createdAt, c.updated_at AS updatedAt
         FROM plan_computation pc
         JOIN computation_definition c ON c.id = pc.computation_id
        WHERE pc.plan_id = ?
        ORDER BY c.name ASC`,
      [planId]
    )
    res.json({ computations: rows })
  } catch (e) {
    res.status(500).json({ error: 'Failed to load plan computations', detail: e.message })
  }
})

// -------------------- SOURCE DATA --------------------

// Utilities
function toInputDate(value) {
  if (!value) return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const d = new Date(value)
  if (isNaN(d)) return null
  const tzAdjusted = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return tzAdjusted.toISOString().slice(0, 10)
}

// GET /api/source-data?participantId=&label=&from=&to=&limit=&offset=
app.get('/api/source-data', async (req, res) => {
  try {
    const where = []
    const params = []
    const { participantId, label, from, to } = req.query

    if (participantId && Number.isFinite(Number(participantId))) {
      where.push('participant_id = ?'); params.push(Number(participantId))
    }
    if (label && String(label).trim()) {
      where.push('label = ?'); params.push(String(label).trim())
    }
    if (from) {
      const f = toInputDate(from); if (f) { where.push('metric_date >= ?'); params.push(f) }
    }
    if (to) {
      const t = toInputDate(to); if (t) { where.push('metric_date <= ?'); params.push(t) }
    }

    const clause = where.length ? ('WHERE ' + where.join(' AND ')) : ''
    const limit = Math.min(Math.max(Number(req.query.limit ?? 200), 1), 5000)
    const offset = Math.max(Number(req.query.offset ?? 0), 0)

    const [rows] = await pool.execute(
      `SELECT id, participant_id AS participantId, label, description,
              metric_date AS date, value, created_at AS createdAt, updated_at AS updatedAt
         FROM source_data
         ${clause}
        ORDER BY metric_date DESC, id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )

    // total count (for pagination if you want)
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM source_data ${clause}`, params
    )

    res.json({ records: rows, total, limit, offset })
  } catch (e) {
    res.status(500).json({ error: 'Failed to list source data', detail: e.message })
  }
})

// POST /api/source-data  (single add)
app.post('/api/source-data', async (req, res) => {
  try {
    const { participantId, label, description, date, value } = req.body || {}
    const pid = Number(participantId)
    const lbl = (label ?? '').toString().trim()
    const val = Number(value)
    const d = toInputDate(date)

    if (!Number.isFinite(pid)) return res.status(400).json({ error: 'Invalid participantId' })
    if (!lbl) return res.status(400).json({ error: 'Label is required' })
    if (!d) return res.status(400).json({ error: 'Invalid date (use YYYY-MM-DD)' })
    if (!Number.isFinite(val)) return res.status(400).json({ error: 'Invalid value' })

    const [ins] = await pool.execute(
      `INSERT INTO source_data (participant_id, label, description, metric_date, value)
       VALUES (?,?,?,?,?)`,
      [pid, lbl, description ?? null, d, val]
    )
    res.status(201).json({ id: ins.insertId })
  } catch (e) {
    res.status(500).json({ error: 'Failed to insert source data', detail: e.message })
  }
})

// POST /api/source-data/bulk  (CSV textarea)
app.post('/api/source-data/bulk', async (req, res) => {
  try {
    const { csv } = req.body || {}
    if (!csv || typeof csv !== 'string') {
      return res.status(400).json({ error: 'CSV text is required in { csv }' })
    }

    // Basic CSV parser (handles quoted fields and commas-in-quotes)
    function parseCSV(text) {
      const rows = []
      let field = '', row = [], inQuotes = false, i = 0
      while (i < text.length) {
        const c = text[i]
        if (inQuotes) {
          if (c === '"') {
            if (text[i + 1] === '"') { field += '"'; i += 2; continue } // escaped quote
            inQuotes = false; i++; continue
          } else { field += c; i++; continue }
        } else {
          if (c === '"') { inQuotes = true; i++; continue }
          if (c === ',') { row.push(field); field = ''; i++; continue }
          if (c === '\n' || c === '\r') {
            // handle CRLF or LF
            if (c === '\r' && text[i + 1] === '\n') i++
            row.push(field); rows.push(row); field = ''; row = []; i++; continue
          }
          field += c; i++; continue
        }
      }
      // last field
      row.push(field); rows.push(row)
      // trim possible trailing blank line
      if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0].trim() === '') rows.pop()
      return rows
    }

    const rows = parseCSV(csv)
    if (!rows.length) return res.status(400).json({ error: 'CSV is empty' })

    const header = rows[0].map(h => h.trim().toLowerCase())
    const body = rows.slice(1)

    // Map flexible header names
    function idx(...alts) {
      for (const a of alts) {
        const k = a.toLowerCase()
        const i = header.findIndex(h => h === k)
        if (i !== -1) return i
      }
      return -1
    }

    const iPid  = idx('participant id','participant_id','participantid','participant')
    const iLbl  = idx('data source label','label','source label','source_label')
    const iDesc = idx('description','desc','notes')
    const iDate = idx('date','metric_date','metric date')
    const iVal  = idx('value','amount','val')

    if (iPid < 0 || iLbl < 0 || iDate < 0 || iVal < 0) {
      return res.status(400).json({ error: 'Header row must include Participant ID, Label, Date, Value' })
    }

    // Validate and collect
    const good = []
    const errors = []
    for (let r = 0; r < body.length; r++) {
      const row = body[r]
      const lineNo = r + 2 // 1-based + header
      const pid = Number(row[iPid])
      const lbl = (row[iLbl] ?? '').toString().trim()
      const date = toInputDate(row[iDate])
      const val = Number(row[iVal])
      const desc = (iDesc >= 0 ? row[iDesc] : null) || null

      if (!Number.isFinite(pid)) { errors.push({ line: lineNo, error: 'Invalid participantId', raw: row }); continue }
      if (!lbl) { errors.push({ line: lineNo, error: 'Missing label', raw: row }); continue }
      if (!date) { errors.push({ line: lineNo, error: 'Invalid date', raw: row }); continue }
      if (!Number.isFinite(val)) { errors.push({ line: lineNo, error: 'Invalid value', raw: row }); continue }

      good.push({ pid, lbl, desc, date, val })
    }

    if (!good.length) {
      return res.status(400).json({ error: 'No valid rows', errors })
    }

    // Bulk insert
    const placeholders = good.map(() => '(?,?,?,?,?)').join(',')
    const params = []
    for (const g of good) params.push(g.pid, g.lbl, g.desc, g.date, g.val)

    await pool.execute(
      `INSERT INTO source_data (participant_id, label, description, metric_date, value)
       VALUES ${placeholders}`,
      params
    )

    res.json({ inserted: good.length, errors })
  } catch (e) {
    res.status(500).json({ error: 'Bulk insert failed', detail: e.message })
  }
})

// DELETE /api/source-data/:id
app.delete('/api/source-data/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' })
  try {
    const [r] = await pool.execute(`DELETE FROM source_data WHERE id = ?`, [id])
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true, removed: r.affectedRows })
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete record', detail: e.message })
  }
})

// Bulk delete: DELETE /api/source-data  with body  { ids: [1,2,3] }
app.delete('/api/source-data', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : []
  if (!ids.length) return res.status(400).json({ error: 'ids (non-empty array) is required' })

  // (Optional) guard against huge IN lists:
  if (ids.length > 1000) return res.status(413).json({ error: 'Too many ids; send in smaller batches' })

  try {
    const placeholders = ids.map(() => '?').join(',')
    const [r] = await pool.execute(
      `DELETE FROM source_data WHERE id IN (${placeholders})`,
      ids
    )
    return res.json({ ok: true, deleted: r.affectedRows })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to delete source data', detail: e.message })
  }
})


// ---------- RUN COMPUTATIONS (LODASH-DRIVEN) ----------
let __lodashTemplate = null
async function getLodashTemplate() {
  if (typeof __lodashTemplate === 'function') return __lodashTemplate
  try { const m = await import('lodash-es'); const fn = m?.template ?? m?.default?.template; if (typeof fn === 'function') return (__lodashTemplate = fn) } catch {}
  try { const m = await import('lodash');    const fn = m?.template ?? m?.default?.template; if (typeof fn === 'function') return (__lodashTemplate = fn) } catch {}
  return null
}

app.post('/api/plans/:id/run-computations', async (req, res) => {
  const planId = Number(req.params.id)
  if (!Number.isFinite(planId)) return res.status(400).json({ error: 'Invalid plan id' })

  const lodashTemplate = await getLodashTemplate()
  if (typeof lodashTemplate !== 'function') {
    return res.status(500).json({ error: 'Lodash not available on server. Install lodash or lodash-es.' })
  }

  const YMIN = '0001-01-01', YMAX = '9999-12-31'
  const toYMD = (v, fb) => {
    if (!v) return fb
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0,10)
    const d = new Date(v); return isNaN(d) ? fb :
      `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`
  }
  const unescapeHtml = (s='') => String(s).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
  const parseMaybeJSON = (raw) => {
    if (raw == null) return null
    if (typeof raw === 'number') return raw
    let s = String(raw).trim(); if (!s) return null
    if (s.startsWith('{') || s.startsWith('[')) { try { return JSON.parse(s) } catch {} try { return JSON.parse(unescapeHtml(s)) } catch {} return null }
    if (!isNaN(Number(s))) return Number(s)
    return null
  }
  const normKey = (s) => String(s || '').trim().toUpperCase()

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    // ---- plan & periods
    const [[plan]] = await conn.execute(
      `SELECT id, payout_frequency AS payoutFrequency, effective_start AS effectiveStart, effective_end AS effectiveEnd
         FROM comp_plan WHERE id = ?`, [planId]
    )
    if (!plan) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'Plan not found' }) }

    const [periodRows] = await conn.execute(
      `SELECT id, label,
              start_date AS startDate,
              end_date   AS endDate,
              end_date AS dueDate
         FROM plan_payout_period
        WHERE plan_id = ?
        ORDER BY start_date ASC, id ASC`, [planId]
    )
    const planWindow = {
      startDate: toYMD(plan.effectiveStart, YMIN),
      endDate:   toYMD(plan.effectiveEnd,   YMAX),
      label:     'Plan Window',
      dueDate:   toYMD(plan.effectiveEnd,   toYMD(plan.effectiveStart, YMAX))
    }

    // ---- participants attached to this plan
    const [participants] = await conn.execute(
      `SELECT DISTINCT participant_id AS participantId
         FROM participant_plan
        WHERE plan_id = ?`, [planId]
    )
    if (!participants.length) {
      await conn.rollback(); conn.release()
      return res.json({ planId, participants: 0, computations: 0, periods: 0, inserted: 0, note: 'No participants attached to plan.' })
    }
    const pIds = participants.map(p => p.participantId)

    // ---- ORG MAP (GLOBAL): manager -> [direct report ids]  (any depth)
    const reportsByManager = new Map()
    {
      const [rows] = await conn.execute(
        `SELECT manager_participant_id AS managerId, id AS participantId
           FROM plan_participant
          WHERE manager_participant_id IS NOT NULL`
      )
      for (const r of rows) {
        if (!reportsByManager.has(r.managerId)) reportsByManager.set(r.managerId, [])
        reportsByManager.get(r.managerId).push(r.participantId)
      }
    }

    // people dictionary for nice payload
    const allIdsForNames = new Set()
    for (const arr of reportsByManager.values()) arr.forEach(id => allIdsForNames.add(id))
    pIds.forEach(id => allIdsForNames.add(id))
    const peopleById = new Map()
    if (allIdsForNames.size) {
      const ids = [...allIdsForNames]
      const ph = ids.map(()=>'?').join(',')
      const [people] = await conn.execute(
        `SELECT id, first_name AS firstName, last_name AS lastName, email
           FROM plan_participant
          WHERE id IN (${ph})`, ids
      )
      for (const r of people) peopleById.set(r.id, r)
    }

    // ---- computations attached to plan
    const [comps] = await conn.execute(
      `SELECT c.id, c.name, c.scope, c.template
         FROM plan_computation pc
         JOIN computation_definition c ON c.id = pc.computation_id
        WHERE pc.plan_id = ?
        ORDER BY c.name ASC`, [planId]
    )
    if (!comps.length) {
      await conn.rollback(); conn.release()
      return res.json({ planId, participants: participants.length, computations: 0, periods: 0, inserted: 0, note: 'No computations attached to plan.' })
    }

    // idempotent clear for this plan
    await conn.execute(`DELETE FROM participant_payout_history WHERE plan_id = ?`, [planId])

    // precompile templates
    const compiled = new Map()
    for (const c of comps) compiled.set(c.id, lodashTemplate(c.template || ''))

    // ---- helpers

    // Get all descendant ids (direct + indirect), excluding the root id
    function getDescendants(rootId) {
      const out = new Set()
      const q = [...(reportsByManager.get(rootId) || [])]
      while (q.length) {
        const id = q.shift()
        if (out.has(id)) continue
        out.add(id)
        const kids = reportsByManager.get(id)
        if (kids && kids.length) q.push(...kids)
      }
      return [...out]
    }

    // Sum source_data for a set of targetIds within [start,end]
    async function fetchTotalsForTargets(targetIds, startDate, endDate) {
      if (!targetIds?.length) return {}
      const ph = targetIds.map(()=>'?').join(',')
      const [rows] = await conn.execute(
        `SELECT UPPER(TRIM(label)) AS label, SUM(value) AS total
           FROM source_data
          WHERE participant_id IN (${ph})
            AND metric_date >= ?
            AND metric_date <= ?
          GROUP BY UPPER(TRIM(label))`,
        [...targetIds, toYMD(startDate, YMIN), toYMD(endDate, YMAX)]
      )
      const totals = {}
      for (const r of rows) totals[r.label] = Number(r.total || 0)
      return totals
    }

    function normalizeTemplateOutput(comp, raw) {
      const parsed = parseMaybeJSON(raw)
      const out = []
      const pushOne = (obj) => {
        const label = String(obj?.label ?? comp.name ?? 'RESULT').trim()
        const amount = Number(obj?.amount ?? obj?.amt ?? obj?.value ?? obj)
        if (!label || !Number.isFinite(amount)) return
        const payload = obj?.payload ?? obj?.meta ?? obj
        out.push({ label, amount, payload })
      }
      if (Array.isArray(parsed)) parsed.forEach(pushOne)
      else if (parsed && typeof parsed === 'object') pushOne(parsed)
      else if (typeof parsed === 'number') pushOne({ label: comp.name, amount: parsed })
      return out
    }

    let inserted = 0
    const errors = []

    // ---- main loop
    for (const p of participants) {
      const participantId = p.participantId
      const descendantIds = getDescendants(participantId)          // all levels
      const directIds = reportsByManager.get(participantId) || []  // immediate

      // rollup meta for payload
      const rollupMeta = {
        scope: descendantIds.length ? 'manager' : 'individual',
        managerId: participantId,
        directReportIds: [...directIds],
        descendantIds: [...descendantIds],
        directReports: directIds.map(id => ({ id, ...(peopleById.get(id) || {}) })),
        descendants:   descendantIds.map(id => ({ id, ...(peopleById.get(id) || {}) }))
      }

      for (const comp of comps) {
        const tpl = compiled.get(comp.id)
        const scope = comp.scope === 'plan' ? 'plan' : 'payout'
        const periods = scope === 'plan'
          ? [planWindow]
          : (periodRows.length ? periodRows.map(r => ({
                startDate: toYMD(r.startDate, YMIN),
                endDate:   toYMD(r.endDate,   YMAX),
                label:     r.label || '',
                dueDate:   toYMD(r.dueDate,   toYMD(r.endDate, YMAX))
             })) : [planWindow])

        for (const prd of periods) {
          try {
            // compute BOTH totals:
            const selfTotals = await fetchTotalsForTargets([participantId], prd.startDate, prd.endDate)
            const drTotals   = descendantIds.length
              ? await fetchTotalsForTargets(descendantIds, prd.startDate, prd.endDate)
              : {}

            // lodash context
            const context = {
              // legacy compatibility: totals = self totals
              totals: selfTotals,
              totals_dr: drTotals,

              sum:    (label) => Number(selfTotals?.[normKey(label)] ?? 0),
              sum_dr: (label) => Number(drTotals?.[normKey(label)] ?? 0),

              has:    (label) => Object.prototype.hasOwnProperty.call(selfTotals, normKey(label)),
              has_dr: (label) => Object.prototype.hasOwnProperty.call(drTotals,   normKey(label)),

              period: {
                start: prd.startDate,
                end:   prd.endDate,
                label: prd.label || '',
                dueDate: prd.dueDate || prd.endDate
              },
              participantId,
              planId,

              // org helpers available to templates
              directReports: rollupMeta.directReports,
              descendants:   rollupMeta.descendants,
              rollupInfo: () => rollupMeta,

              // emit function (returns JSON string)
              emit_commission: JSON.stringify,
            }

            const rendered = tpl(context)           // must use <%= emit_commission(...) %> in template
            const items = normalizeTemplateOutput(comp, rendered)
            if (!items.length) continue

            // insert rows
            const valuesSQL = items.map(() => '(?,?,?,?,?,?,?,?,?,?)').join(',')
            const params = []
            for (const it of items) {
              const payloadMerged = { ...(it.payload || {}), rollup: rollupMeta }
              params.push(
                planId,
                participantId,
                comp.id,
                prd.startDate,
                prd.endDate,
                prd.label || null,
                prd.dueDate || prd.endDate,
                it.label,
                Number(it.amount.toFixed(4)),
                JSON.stringify(payloadMerged)
              )
            }
            await conn.execute(
              `INSERT INTO participant_payout_history
                 (plan_id, participant_id, computation_id,
                  period_start, period_end, period_label, due_date,
                  output_label, amount, payload)
               VALUES ${valuesSQL}`,
              params
            )
            inserted += items.length
          } catch (e) {
            errors.push({ participantId, computationId: comp.id, error: e.message })
          }
        }
      }
    }

    await conn.commit(); conn.release()
    res.json({ planId, participants: participants.length, computations: comps.length, periods: periodRows.length || 1, inserted, errors })
  } catch (e) {
    try { await conn.rollback() } catch {}
    conn.release()
    console.error(e)
    res.status(500).json({ error: 'Run computations failed', detail: e.message })
  }
})


// Payout history for a participant, grouped by plan & period
// GET /api/participants/:id/payout-history?planId=&from=&to=
app.get('/api/participants/:id/payout-history', async (req, res) => {
  const participantId = Number(req.params.id)
  if (!Number.isFinite(participantId)) return res.status(400).json({ error: 'Invalid participant id' })

  const toInputDate = (value) => {
    if (!value) return null
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
    const d = new Date(value)
    if (isNaN(d)) return null
    const tzAdjusted = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    return tzAdjusted.toISOString().slice(0, 10)
  }

  try {
    const where = ['pph.participant_id = ?']
    const params = [participantId]
    const { planId, from, to } = req.query

    if (planId && Number.isFinite(Number(planId))) {
      where.push('pph.plan_id = ?'); params.push(Number(planId))
    }
    const f = toInputDate(from); if (f) { where.push('pph.period_start >= ?'); params.push(f) }
    const t = toInputDate(to);   if (t) { where.push('pph.period_end   <= ?'); params.push(t) }

    const clause = 'WHERE ' + where.join(' AND ')

    const [rows] = await pool.execute(
      `SELECT
        pph.id                 AS id,
        pph.plan_id            AS planId,
        cp.name                AS planName,
        cp.version             AS planVersion,
        pph.period_start       AS periodStart,
        pph.period_end         AS periodEnd,
        pph.period_label       AS periodLabel,
        pph.due_date           AS dueDate,
        pph.output_label       AS outputLabel,
        pph.amount             AS amount,
        pph.computation_id     AS computationId,
        cd.name                AS computationName,
        pph.payload            AS payload,
        pph.created_at         AS createdAt
      FROM participant_payout_history pph
      JOIN comp_plan cp ON cp.id = pph.plan_id
      LEFT JOIN computation_definition cd ON cd.id = pph.computation_id
      ${clause}
      ORDER BY pph.plan_id ASC, pph.period_start ASC, pph.id ASC`,
      params
    )

    // Group → plans → periods → lines
    const plansMap = new Map()
    for (const r of rows) {
      if (!plansMap.has(r.planId)) {
        plansMap.set(r.planId, {
          planId: r.planId,
          planName: r.planName,
          planVersion: r.planVersion,
          periods: []
        })
      }
      const plan = plansMap.get(r.planId)

      const key = `${r.periodStart}|${r.periodEnd}|${r.periodLabel||''}`
      let period = plan.periods.find(p => p._key === key)
      if (!period) {
        period = {
          _key: key, // internal
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          periodLabel: r.periodLabel || null,
          dueDate: r.dueDate || r.periodEnd,
          total: 0,
          lines: []
        }
        plan.periods.push(period)
      }
      period.lines.push({
        id: r.id,
        outputLabel: r.outputLabel,
        amount: Number(r.amount || 0),
        computationId: r.computationId,
        computationName: r.computationName || null,
        payload: r.payload ?? null,
        createdAt: r.createdAt
      })
      period.total += Number(r.amount || 0)
    }

    const payload = {
      participantId,
      plans: Array.from(plansMap.values())
    }
    res.json(payload)
  } catch (e) {
    res.status(500).json({ error: 'Failed to load payout history', detail: e.message })
  }
})



// POST /api/participants/:id/comp-statement
// --- shared helpers (same semantics as your PDF route) ---------------------
const isYMD = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test((s || '').slice(0,10))
const toYMD = (v) => {
  if (!v) return ''
  if (isYMD(v)) return v.slice(0,10)
  const d = new Date(v)
  if (isNaN(d)) return ''
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const minDate = (a, b) => (!a ? b : !b ? a : (a <= b ? a : b))
const maxDate = (a, b) => (!a ? b : !b ? a : (a >= b ? a : b))
const fmtMoney = (n) => Number(n || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

function prettyTemplate(src = '') {
  let s = String(src || '').replace(/\r\n?/g, '\n').trim()
  s = s
    .replace(/;(?=\S)/g, ';\n')
    .replace(/\n\s*\/\//g, '\n//')
    .replace(/{\s*/g, '{\n')
    .replace(/\s*}/g, '\n}')
    .replace(/\n{3,}/g, '\n\n')
  const lines = s.split('\n')
  let depth = 0
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim()
    if (line.startsWith('}')) depth = Math.max(0, depth - 1)
    lines[i] = '  '.repeat(depth) + line
    if (line.endsWith('{')) depth++
  }
  return lines.join('\n').trim()
}
app.post('/api/participants/:id/comp-statement', async (req, res) => {

  const participantId = Number(req.params.id)
  const planIds = Array.isArray(req.body?.planIds)
    ? req.body.planIds.map(Number).filter(Number.isFinite)
    : []

  if (!Number.isFinite(participantId)) return res.status(400).json({ error: 'Invalid participant id' })
  if (!planIds.length) return res.status(400).json({ error: 'planIds is required (non-empty array)' })

  const conn = await pool.getConnection()
  try {
    // --- Participant
    const [[pt]] = await conn.execute(
      `SELECT id, first_name AS firstName, last_name AS lastName, email, employee_id AS employeeId
         FROM plan_participant WHERE id = ?`,
      [participantId]
    )

    // --- Verify plans (accept plan_id or participant_plan.id)
    let validPlanIds = []
    {
      const [attached] = await conn.execute(
        `SELECT plan_id AS planId FROM participant_plan
          WHERE participant_id = ? AND plan_id IN (${planIds.map(() => '?').join(',')})`,
        [participantId, ...planIds]
      )
      if (attached.length) {
        validPlanIds = attached.map(r => r.planId)
      } else {
        const [byJunc] = await conn.execute(
          `SELECT plan_id AS planId FROM participant_plan
            WHERE participant_id = ? AND id IN (${planIds.map(() => '?').join(',')})`,
          [participantId, ...planIds]
        )
        if (byJunc.length) validPlanIds = byJunc.map(r => r.planId)
      }
    }
    if (!validPlanIds.length) {
      conn.release()
      return res.status(404).json({ error: 'Participant is not attached to any of the selected plans.' })
    }

    // --- Plans (headers)
    const [plans] = await conn.execute(
      `SELECT id, name, version, effective_start AS effectiveStart, effective_end AS effectiveEnd
         FROM comp_plan WHERE id IN (${validPlanIds.map(() => '?').join(',')})`,
      validPlanIds
    )
    const planById = Object.fromEntries(plans.map(p => [p.id, p]))

    // --- Payouts (all labels/periods)
    const [payouts] = await conn.execute(
      `SELECT plan_id AS planId,
              period_label  AS periodLabel,
              period_start  AS periodStart,
              period_end    AS periodEnd,
              COALESCE(due_date, period_end) AS dueDate,
              output_label  AS outputLabel,
              amount,
              created_at    AS createdAt
         FROM participant_payout_history
        WHERE participant_id = ?
          AND plan_id IN (${validPlanIds.map(() => '?').join(',')})
        ORDER BY plan_id ASC, period_label ASC, period_start ASC, id ASC`,
      [participantId, ...validPlanIds]
    )

    // --- Group payouts: plan -> label/window key
    const groupsByPlanMap = new Map()
    for (const row of payouts) {
      const pid = row.planId
      if (!groupsByPlanMap.has(pid)) groupsByPlanMap.set(pid, new Map())
      const rowStart = toYMD(row.periodStart), rowEnd = toYMD(row.periodEnd), rowDue = toYMD(row.dueDate)
      const cleanLabel = (row.periodLabel && String(row.periodLabel).trim()) || null
      const key = cleanLabel || `${rowStart} -> ${rowEnd}`
      let g = groupsByPlanMap.get(pid).get(key)
      if (!g) {
        g = { key, label: cleanLabel || key, start: rowStart, end: rowEnd, due: rowDue, total: 0, items: [] }
        groupsByPlanMap.get(pid).set(key, g)
      } else {
        g.start = minDate(g.start, rowStart)
        g.end   = maxDate(g.end, rowEnd)
        g.due   = maxDate(g.due, rowDue)
      }
      g.total += Number(row.amount || 0)
      g.items.push({ outputLabel: row.outputLabel, amount: Number(row.amount || 0), createdAt: row.createdAt })
    }
    // simple object form for EJS
    const groupsByPlanId = Object.fromEntries(
      [...groupsByPlanMap.entries()].map(([planId, mp]) => [planId, [...mp.values()]])
    )

    // --- Computations (Appendix)
    let appendix = []
    try {
      const [comps] = await conn.execute(
        `SELECT pc.plan_id AS planId, c.id, c.name, c.scope, c.template
           FROM plan_computation pc
           JOIN computation_definition c ON c.id = pc.computation_id
          WHERE pc.plan_id IN (${validPlanIds.map(() => '?').join(',')})
          ORDER BY pc.plan_id ASC, c.name ASC`,
        validPlanIds
      )
      appendix = comps.map(r => ({
        planId: r.planId,
        id: r.id,
        name: r.name,
        scope: (r.scope || '').toLowerCase() === 'plan' ? 'Entire Plan Window' : 'Per Payout Period',
        template: prettyTemplate(r.template || '')
      }))
    } catch {
      appendix = []
    }

    // --- Manager Roll-up scope (manager + direct reports)
    const [drRows] = await conn.execute(
      `SELECT id FROM plan_participant WHERE manager_participant_id = ?`,
      [participantId]
    )
    const directReportIds = drRows.map(r => r.id)
    const participantScopeIds = [participantId, ...directReportIds]

    async function getSourceRows(startDate, endDate) {
      if (!startDate || !endDate) return []
      const placeholders = participantScopeIds.map(() => '?').join(',')
      const params = [...participantScopeIds, startDate, endDate]
      const [rows] = await conn.execute(
        `SELECT id,
                participant_id AS participantId,
                label,
                metric_date AS date,
                value,
                description
           FROM source_data
          WHERE participant_id IN (${placeholders})
            AND metric_date >= ?
            AND metric_date <= ?
          ORDER BY metric_date ASC, id ASC`,
        params
      )
      return rows.map(r => ({
        ...r,
        origin: (r.participantId === participantId) ? 'Direct' : `Roll-up (${r.participantId})`
      }))
    }

    // Build a per-window cache for source rows keyed by group.key (label or date window)
    const sourceDataByWindow = {}
    for (const pid of validPlanIds) {
      const groups = groupsByPlanId[pid] || []
      for (const g of groups) {
        const cacheKey = g.key
        if (!sourceDataByWindow[cacheKey]) {
          sourceDataByWindow[cacheKey] = await getSourceRows(g.start, g.end)
        }
      }
    }

    // -----------------------------------------------------------------------
    // Load EJS template from MariaDB (settings.setting_name = 'comp_plan_template_ejs')
    // Honors an optional body override __TEMP_INLINE_TEMPLATE__ for quick testing
    let templateString = ''
    if (typeof req.body?.__TEMP_INLINE_TEMPLATE__ === 'string' && req.body.__TEMP_INLINE_TEMPLATE__.trim()) {
      templateString = req.body.__TEMP_INLINE_TEMPLATE__
    } else {
      const [tplRows] = await conn.execute(
        `SELECT setting_value
          FROM settings
          WHERE setting_name = ?
          ORDER BY id DESC
          LIMIT 1`,
        ['comp_plan_template_ejs']
      )
      templateString = (tplRows?.[0]?.setting_value || '').toString()
    }

    // If there’s still no template, either error out or fall back to a tiny placeholder:
    if (!templateString.trim()) {
      // Option A: hard error (recommended so you notice misconfig)
      return res.status(500).json({
        error: "Comp plan template not configured",
        detail: "Add a row in settings with setting_name='comp_plan_template_ejs'."
      })

      // Option B: fallback HTML (uncomment to use)
      // templateString = `<!DOCTYPE html><html><body><p>Template not found. Please load from DB.</p></body></html>`
    }
    // -----------------------------------------------------------------------

    const html = await ejs.render(templateString, {
      // data payload
      generatedAt: new Date().toLocaleString(),
      participant: pt || { id: participantId },
      plans,
      groupsByPlanId,      // { [planId]: [{ key,label,start,end,due,total,items[] }, ...] }
      sourceDataByWindow,  // { [groupKey]: [ {date,label,value,origin,description}, ... ] }
      appendix,

      // helpers available in EJS
      toYMD,
      fmtMoney
    }, { async: true })

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.status(200).send(html)

  } catch (e) {
    console.error(e)
    if (!res.headersSent) res.status(500).json({ error: 'Failed to render statement', detail: e.message })
  } finally {
    try { conn.release() } catch {}
  }
})


app.get('/api/plans/:id/payout-run-summary', async (req, res) => {
  const planId = Number(req.params.id)
  if (!Number.isFinite(planId)) return res.status(400).json({ error: 'Invalid plan id' })

  try {
    const [rows] = await pool.execute(
      `SELECT
         pph.participant_id            AS participantId,
         p.first_name                  AS firstName,
         p.last_name                   AS lastName,
         COUNT(*)                      AS lineCount,          -- <— rename from "lines"
         COALESCE(SUM(pph.amount), 0)  AS totalAmount,
         MIN(pph.period_start)         AS firstPeriodStart,
         MAX(pph.period_end)           AS lastPeriodEnd,
         MAX(pph.created_at)           AS lastCreatedAt
       FROM participant_payout_history pph
       JOIN plan_participant p ON p.id = pph.participant_id
       WHERE pph.plan_id = ?
       GROUP BY pph.participant_id, p.first_name, p.last_name
       ORDER BY totalAmount DESC, pph.participant_id ASC`,
      [planId]
    )

    res.json({ planId, participants: rows })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to load payout summary', detail: e.message })
  }
})


// GET /api/dashboard
app.get('/api/dashboard', async (req, res) => {
  const conn = await pool.getConnection()
  try {
    // ---- Totals ------------------------------------------------------------
    const [[tp]] = await conn.execute(`SELECT COUNT(*) AS c FROM plan_participant`)
    const [[tl]] = await conn.execute(`SELECT COUNT(*) AS c FROM comp_plan`)
    const [[ts]] = await conn.execute(`SELECT COUNT(*) AS c FROM source_data`)
    const [[tpay]] = await conn.execute(`SELECT COALESCE(SUM(amount),0) AS s FROM participant_payout_history`)

    // computations count: try `computation`, fall back to `computations`
    let computationsCount = 0
    try {
      const [[tc1]] = await conn.execute(`SELECT COUNT(*) AS c FROM computation_defintion`)
      computationsCount = Number(tc1?.c || 0)
    } catch {
      try {
        const [[tc2]] = await conn.execute(`SELECT COUNT(*) AS c FROM computation_defintion`)
        computationsCount = Number(tc2?.c || 0)
      } catch {
        computationsCount = 0
      }
    }

    const totals = {
      participants: Number(tp?.c || 0),
      plans: Number(tl?.c || 0),
      computations: computationsCount,
      sourceRows: Number(ts?.c || 0),
      payoutTotal: Number(tpay?.s || 0),
    }

    // ---- Time series: monthly participants created ------------------------
    // Uses created_at if present; COALESCE to current date to avoid NULL bucket.
    const [participantsOverTime] = await conn.execute(`
      SELECT DATE_FORMAT(COALESCE(effective_start, CURRENT_DATE()), '%Y-%m') AS period,
             COUNT(*) AS count
        FROM plan_participant
    GROUP BY period
    ORDER BY period ASC
    `)

    // ---- Time series: monthly comp plans created --------------------------
    const [plansOverTime] = await conn.execute(`
      SELECT DATE_FORMAT(COALESCE(effective_start, CURRENT_DATE()), '%Y-%m') AS period,
             COUNT(*) AS count
        FROM comp_plan
        where effective_start is not NULL
    GROUP BY period
    ORDER BY period ASC
    `)

    // ---- Stacked source totals by month & label ---------------------------
    const [sourceMonthly] = await conn.execute(`
      SELECT DATE_FORMAT(metric_date, '%Y-%m') AS month,
             label,
             COALESCE(SUM(value),0) AS total
        FROM source_data
    GROUP BY month, label
    ORDER BY month ASC, label ASC
    `)

    // ---- Payouts by quarter (calendar FY label; adjust if you use a custom FY) ----
    // dt = due_date -> period_end -> created_at
    const [payoutsByQuarterRaw] = await conn.execute(`
      SELECT
        YEAR(dt) AS y,
        QUARTER(dt) AS q,
        COALESCE(SUM(amount),0) AS total
      FROM (
        SELECT COALESCE(due_date, period_end, created_at) AS dt, amount
          FROM participant_payout_history
      ) t
      WHERE dt IS NOT NULL
      GROUP BY y, q
      ORDER BY y ASC, q ASC
    `)
    const payoutsByQuarter = payoutsByQuarterRaw.map(r => ({
      quarter: `FY${r.y} Q${r.q}`,   // if your FY starts in a different month, we can offset this
      total: Number(r.total || 0),
    }))

    res.json({
      totals,
      participantsOverTime: participantsOverTime.map(r => ({ period: r.period, count: Number(r.count || 0) })),
      plansOverTime:        plansOverTime.map(r => ({ period: r.period, count: Number(r.count || 0) })),
      sourceMonthly:        sourceMonthly.map(r => ({ month: r.month, label: r.label, total: Number(r.total || 0) })),
      payoutsByQuarter,
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to build dashboard', detail: e.message })
  } finally {
    try { conn.release() } catch {}
  }
})


// ---------- Admin: Backup ----------
app.get('/api/admin/backup', async (req, res) => {

  const DB_HOST = process.env.DB_HOST
  const DB_PORT = Number(process.env.DB_PORT)
  const DB_USER = process.env.DB_USER
  const DB_PASSWORD = process.env.DB_PASSWORD
  const DB_NAME = process.env.DB_NAME

  try {
    const { default: mysqldump } = await import('mysqldump')

    const dump = await mysqldump({
      connection: {
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD || undefined,
        database: DB_NAME,
      },
      dump: {
        schema:  { table: { dropIfExist: true } },
        data:    { format: true },
        trigger: true,
        routine: true,
        view:    true,
      },
    })

    const sql = [
      `-- Dump of database ${DB_NAME} on ${new Date().toISOString()}\n`,
      dump.dump?.schema  || '',
      dump.dump?.trigger || '',
      dump.dump?.routine || '',
      dump.dump?.view    || '',
      dump.dump?.data    || '',
    ].join('\n')

    const dateStr = new Date().toISOString().slice(0,10) // YYYY-MM-DD
    const fname = `varcac_db_backup-${dateStr}.sql`

    res.setHeader('Content-Type', 'application/sql; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`)
    res.status(200).end(sql, 'utf8') // send directly, no temp file
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Backup failed', detail: e.message })
  }
})


// ---------- Admin: Restore ----------
app.post('/api/admin/restore', upload.single('dump'), async (req, res) => {
  const confirm = req.body?.confirm
  if (confirm !== 'ERASE') return res.status(400).json({ error: 'Confirmation required: type ERASE' })
  if (!req.file?.path)   return res.status(400).json({ error: 'Missing dump file' })

  const DB_HOST = process.env.DB_HOST
  const DB_PORT = Number(process.env.DB_PORT)
  const DB_USER = process.env.DB_USER
  const DB_PASSWORD = process.env.DB_PASSWORD
  const DB_NAME = process.env.DB_NAME

  const dumpPath = req.file.path

  try {
    const args = ['-h', DB_HOST, '-P', DB_PORT, '-u', DB_USER]
    if (DB_PASSWORD) args.push(`-p${DB_PASSWORD}`)
    args.push(DB_NAME)

    await new Promise((resolve, reject) => {
      const mysql = spawn('mysql', args, { stdio: ['pipe', 'pipe', 'pipe'] })

      let stderr = ''
      mysql.stderr.on('data', (d) => { stderr += d.toString() })

      // 1) disable checks
      mysql.stdin.write([
        'SET FOREIGN_KEY_CHECKS=0;',
        'SET UNIQUE_CHECKS=0;',
        'SET SQL_NOTES=0;',
        '\n'
      ].join('\n'))

      // 2) stream file
      const rs = fs.createReadStream(dumpPath)
      rs.pipe(mysql.stdin, { end: false })
      rs.on('error', (e) => reject(e))
      rs.on('end', () => {
        // 3) re-enable checks and end stdin
        mysql.stdin.write([
          '\n',
          'SET SQL_NOTES=1;',
          'SET UNIQUE_CHECKS=1;',
          'SET FOREIGN_KEY_CHECKS=1;',
          '\n'
        ].join('\n'))
        mysql.stdin.end()
      })

      mysql.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(stderr || `mysql exited with ${code}`))
      })
    })

    // ---- NEW: record the restore in settings ----
    try {
      // use the original uploaded file name, not Multer's temp filename
      const fileName = (() => {
        const orig = req.file?.originalname
        if (typeof orig === 'string' && orig.trim()) return path.basename(orig)
        return path.basename(dumpPath)
      })()

      const now = new Date()
      const pad = n => String(n).padStart(2, '0')
      const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
      const value = `Current Data Restored from ${fileName} at ${ts}.`

      const [rows] = await pool.execute(
        'SELECT id FROM settings WHERE setting_name = ? ORDER BY id DESC LIMIT 1',
        ['current_restore']
      )
      if (rows.length) {
        await pool.execute(
          'UPDATE settings SET setting_value = ? WHERE id = ?',
          [value, rows[0].id]
        )
      } else {
        await pool.execute(
          'INSERT INTO settings (setting_name, setting_value) VALUES (?, ?)',
          ['current_restore', value]
        )
      }
    } catch (e) {
      console.warn('Restore completed but failed to write current_restore setting:', e.message)
    }
    // --------------------------------------------

    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Restore failed', detail: e.message })
  } finally {
    try { fs.unlinkSync(dumpPath) } catch {}
  }
})


// READ template by setting_name
app.get('/api/settings/:name', async (req, res) => {
  const name = String(req.params.name || '').trim()
  if (!name) return res.status(400).json({ error: 'Missing setting name' })

  try {
    const [rows] = await pool.execute(
      `SELECT id, setting_name, setting_value
         FROM settings
        WHERE setting_name = ?
        ORDER BY id DESC
        LIMIT 1`,
      [name]
    )
    if (!rows.length) return res.status(204).send() // not found (empty), client can seed a default
    const row = rows[0]
    return res.json({
      id: row.id,
      setting_name: row.setting_name,
      setting_value: row.setting_value,
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to read setting', detail: e.message })
  }
})

// UPSERT (create-or-update) by setting_name
app.put('/api/settings/:name', async (req, res) => {
  const name = String(req.params.name || '').trim()
  if (!name) return res.status(400).json({ error: 'Missing setting name' })

  // Accept strings only; coerce others (null/undefined become empty string)
  const raw = req.body?.setting_value
  const value = typeof raw === 'string' ? raw : String(raw ?? '')

  try {
    // Does a row already exist? (no unique index, so grab the most recent)
    const [rows] = await pool.execute(
      `SELECT id FROM settings
        WHERE setting_name = ?
        ORDER BY id DESC
        LIMIT 1`,
      [name]
    )

    if (rows.length) {
      const id = rows[0].id
      const [r] = await pool.execute(
        `UPDATE settings
            SET setting_value = ?
          WHERE id = ?`,
        [value, id]
      )
      return res.json({ ok: true, updated: r.affectedRows, id })
    } else {
      const [r] = await pool.execute(
        `INSERT INTO settings (setting_name, setting_value)
              VALUES (?, ?)`,
        [name, value]
      )
      return res.json({ ok: true, insertedId: r.insertId })
    }
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to save setting', detail: e.message })
  }
})
