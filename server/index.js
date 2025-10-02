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
//import PDFDocument from 'pdfkit'
import { spawn } from 'child_process'
import multer from 'multer'
import fs from 'fs'
import fsp from 'node:fs/promises'
import os from 'os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ejs from 'ejs'
import { rateLimit, ipKeyGenerator } from 'express-rate-limit'
import { Transform } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { pipeline as pipe } from 'node:stream/promises'
import axios from 'axios'

const baseKey = (req) => (req.user?.id ? `u:${req.user.id}` : ipKeyGenerator(req))

const upload = multer({ dest: os.tmpdir() })

const lodashTemplate = _.template

const FORBIDDEN = /\b(globalThis|global|process|require|module|exports|Function|eval|constructor|__proto__|child_process|fs|import|Buffer|setImmediate|setInterval|setTimeout|clearImmediate|clearInterval|clearTimeout|console|Reflect|Proxy|GeneratorFunction|Object|Object\.assign|Object\.defineProperty|Object\.defineProperties|Object\.setPrototypeOf|Object\.getPrototypeOf|Object\.create|import\.meta|require\.resolve|Intl|Atomics|SharedArrayBuffer|Worker|MessageChannel|performance)\b/
const nameRegex = /^[A-Za-z_][A-Za-z0-9_]*$/

// helpers
const toDateStr = (v) => (v ? String(v).slice(0, 10) : null);
const safeLabel = (v) => (v == null ? null : String(v).slice(0, 120));


const app = express();
app.set('trust proxy', true)
const PORT = process.env.PORT || 3001;

const parser = new Parser({ operators: { logical: true, comparison: true, ternary: true } })
parser.functions.clamp = (x, lo, hi) => Math.min(Math.max(Number(x), Number(lo)), Number(hi))
parser.functions.min = Math.min
parser.functions.max = Math.max
parser.functions.round = (x, d=0) => {
  const p = Math.pow(10, d|0); return Math.round(Number(x)*p)/p
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: baseKey,   // ✅ IPv6-safe
  message: { error: 'Too many requests, please try again later.' },
})


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


app.get('/api/me', apiLimiter, (req, res) => {
  res.json({ user: req.session.user });
});

// Example placeholder (future): minimal users list
app.get('/api/users', (_req, res) => {
  res.json([{ id: 1, username: 'admin', role: 'admin' }]);
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});


// --- pad helpers
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
    logError('PLAN_UPDATE_FAIL', e);
    res.status(500).json({ error: 'Failed to update plan', detail: e.message });
  }
});

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
    console.log(e);
    logError('PERIOD_LOAD_FAIL', e);
    res.status(500).json({ error: 'Failed to load periods', detail: e.message })
  }
})

app.get('/api/plans', async (req, res) => {
  try {
    // default to active (1) unless explicitly set to 0
    const q = req.query?.isActive;
    const isActive =
      q === '0' ? 0 :
      q === '1' ? 1 : 1;

    const [rows] = await pool.execute(
      `SELECT
         id,
         name,
         version,
         effective_start AS effectiveStart,
         payout_frequency AS payoutFrequency,
         effective_end   AS effectiveEnd,
         description,
         created_at      AS createdAt,
         is_active       AS isActive
       FROM comp_plan
       WHERE is_active = ?
       ORDER BY created_at DESC`,
      [isActive]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    logError('FETCH_PLAN_FAIL', e);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

app.get('/api/plans/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const [[plan]] = await pool.execute(
      `SELECT id, name, version, effective_start AS effectiveStart, payout_frequency AS payoutFrequency,
              effective_end AS effectiveEnd, description, created_at AS createdAt, is_active as isActive
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
    console.error(err);
    logError('PLAN_FETCH_DETAIL_FAIL', err)
    res.status(500).json({ error: 'Failed to fetch plan detail' })
  }
})

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


app.delete('/api/plans/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    await pool.execute('DELETE FROM comp_plan WHERE id = :id', { id })
    return res.status(204).end()
  } catch (err) {
    console.error(err)
    logError('DELETE_PLAN_FAIL', e);
    res.status(500).json({ error: 'Failed to delete plan', detail: err.message })
  }
})

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
    logError('PARTICIPANTS_FETCH_FAIL', e);
    res.status(500).json({ error: 'Failed to fetch participants' })
  }
})

app.get('/api/participants/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    // default to active unless explicitly 0
    const q = req.query?.isActive
    const isActive = q === '0' ? 0 : 1

    const [[participant]] = await pool.execute(
      `SELECT id,
              first_name AS firstName,
              last_name  AS lastName,
              email, employee_id AS employeeId,
              manager_participant_id AS managerParticipantId,
              effective_start AS effectiveStart,
              effective_end   AS effectiveEnd,
              created_at AS createdAt
       FROM plan_participant WHERE id = :id`,
      { id }
    )
    if (!participant) return res.status(404).json({ error: 'Participant not found' })

    const [plans] = await pool.execute(
      `SELECT pp.id,
              cp.id AS planId,
              cp.name, cp.version,
              cp.is_active           AS isActive,              -- expose flag
              cp.effective_start     AS planEffectiveStart,
              cp.effective_end       AS planEffectiveEnd,
              pp.effective_start     AS assignmentEffectiveStart,
              pp.effective_end       AS assignmentEffectiveEnd,
              pp.created_at          AS attachedAt
       FROM participant_plan pp
       JOIN comp_plan cp ON cp.id = pp.plan_id
       WHERE pp.participant_id = :id
         AND cp.is_active = :isActive                             -- filter active/archived
       ORDER BY pp.created_at DESC`,
      { id, isActive }
    )

    res.json({ participant, plans })
  } catch (e) {
    console.error(e)
    logError('PARTICIPANT_DETAIL_FETCH_FAIL', e);
    res.status(500).json({ error: 'Failed to fetch participant detail' })
  }
})

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
    logError('PLAN_ALREADY_ATTACHED_FAIL', e)
    if (e?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Plan already attached' })
    console.error(e)
    res.status(400).json({ error: 'Failed to attach plan', detail: e.message })
  }
})

app.delete('/api/participants/:participantId/plans/:participantPlanId', async (req, res) => {
  const participantId = Number(req.params.participantId)
  const participantPlanId = Number(req.params.participantPlanId)
  
  try {
    await pool.execute(
      `DELETE FROM participant_plan WHERE plan_id = :participantPlanId AND participant_id = :participantId`,
      { participantId, participantPlanId }
    )

    await pool.execute(
      `DELETE FROM participant_payout_history WHERE plan_id = :participantPlanId AND participant_id = :participantId`,
      { participantPlanId, participantId }
    )
    
    res.status(204).end()
  } catch (e) {
    console.error(e)
    logError('DETACH_PLAN_FAIL', e);
    res.status(500).json({ error: 'Failed to detach plan', detail: e.message })
  }
})

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
    console.error(e);
    logError('CREATE_PLAN_FAIL', e);
    res.status(500).json({ error: 'Failed to create plan', detail: e.message });
  }
});

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
    logError('PAYOUT_LOAD_FAIL', e);
    res.status(500).json({ error: 'Failed to load payout summary', detail: e.message })
  } finally {
    conn.release()
  }
})


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
    logError('RUN_DETAIL_FAIL', e);
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
    console.error(e);
    logError('PARTICIPANT_DELETE_FAIL', e);

    try { await conn.rollback() } catch {}
    conn.release()
    const code = e?.errno || e?.code
    if (code === 1451 || code === 'ER_ROW_IS_REFERENCED_2') {

      let b = {
        error: 'Cannot delete: participant is referenced by other records.',
        detail: e?.sqlMessage || 'Foreign key constraint failed.',
      };

      console.error(b);

      return res.status(409).json(b)
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

  // 🔒 Security check BEFORE compile
  const m = FORBIDDEN.exec(src)
  if (m) {
    const err = new Error(`Template blocked by security policy (keyword: ${m[0]})`)
    err.code = 'E_TEMPLATE_FORBIDDEN'
    throw err
  }

  if (lodashTemplate) {
    // Minimal settings; lodash has sensible defaults, this is just to be explicit
    lodashTemplate(src) // throws on syntax error
  } else {
    // No lodash available: keep permissive behavior (plain text is fine)
    return
  }
}

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
    console.error(e);
    logError('COMPUTATION_LIST_FAIL', e)
    res.status(500).json({ error: 'Failed to list computations', detail: e.message })
  }
})

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
    console.error(e);
    logError('COMPUTATION_LOAD_FAIL', e);
    res.status(500).json({ error: 'Failed to load computation', detail: e.message })
  }
})

function extractSourceLabelsFromTemplate(tpl) {
  const src = String(tpl ?? '')
  // match:  sum('LABEL')  sum_dr("LABEL")  has('LABEL')  has_dr("LABEL")
  // capture group 2 = the label (handles \" or \')
  const re = /\b(?:sum|sum_dr|has|has_dr)\s*\(\s*(['"])((?:\\.|(?!\1).)*?)\1/g
  const labels = new Set()
  let m
  while ((m = re.exec(src))) {
    // Unescape any \" or \'
    const label = m[2].replace(/\\(['"])/g, '$1').trim()
    if (label) labels.add(label)
  }
  // Return a stable, human-friendly list
  return [...labels].sort((a, b) => a.localeCompare(b)).join(', ')
}

app.post('/api/computations', async (req, res) => {
  const { name, scope, template } = req.body || {}
  if (!name || !nameRegex.test(name)) {
    return res.status(400).json({ error: 'Invalid name. Use letters/numbers/underscore; cannot start with a number.' })
  }
  const scopeVal = isValidScope(scope) ? scope : 'payout'
  try { validateLodashTemplateMaybe(template) }
  catch (e) { 
    logError('INVALID_LODASH_TEMPLATE_FAIL', e)
    return res.status(422).json({ error: 'Invalid lodash template', detail: e.message }) 
  }

  try {
    // ★ insert first (template may be null)
    const [ins] = await pool.execute(
      `INSERT INTO computation_definition (name, scope, template)
       VALUES (?, ?, ?)`,
      [name, scopeVal, template || null]
    )

    // ★ compute inputs from the just-saved template (stringify guards null)
    const inputsCSV = extractSourceLabelsFromTemplate(template)

    // ★ persist the inputs list
    await pool.execute(
      `UPDATE computation_definition
          SET source_data_inputs = ?
        WHERE id = ?`,
      [inputsCSV || null, ins.insertId]
    )

    res.status(201).json({ id: ins.insertId, name, scope: scopeVal, source_data_inputs: inputsCSV })
  } catch (e) {
    logError('COMPUTATION_ADD_FAIL', e);
    if (e?.errno === 1062) return res.status(409).json({ error: 'Computation name already exists' })
    res.status(500).json({ error: 'Failed to create computation', detail: e.message })
  }
})

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
  catch (e) { 
    logError('INVALID_LODASH_TEMPLATE_FAIL2', e)
    return res.status(422).json({ error: 'Invalid lodash template', detail: e.message }) 
  }

  const sets = [], params = []
  if (name !== undefined)     { sets.push('name = ?');     params.push(name) }
  if (scope !== undefined)    { sets.push('scope = ?');    params.push(scope) }
  if (template !== undefined) { sets.push('template = ?'); params.push(template || null) }

  // If nothing to update, we still refresh source_data_inputs from current template
  const doNoOpUpdate = !sets.length

  try {
    if (!doNoOpUpdate) {
      params.push(id)
      await pool.execute(
        `UPDATE computation_definition
            SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        params
      )
    }

    // --- ★ Always recompute source_data_inputs (from new template if provided, else fetch)
    let tplStr = template
    if (tplStr === undefined) {
      const [[row]] = await pool.execute(
        `SELECT template FROM computation_definition WHERE id = ? LIMIT 1`,
        [id]
      )
      tplStr = row?.template ?? ''
    }
    const inputsCSV = extractSourceLabelsFromTemplate(tplStr)
    await pool.execute(
      `UPDATE computation_definition
          SET source_data_inputs = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [inputsCSV || null, id]
    )

    res.json({ ok: true, updated: doNoOpUpdate ? 0 : 1, source_data_inputs: inputsCSV })
  } catch (e) {
    logError('COMPUTATION_PUT_FAIL', e);
    if (e?.errno === 1062) return res.status(409).json({ error: 'Computation name already exists' })
    res.status(500).json({ error: 'Failed to update computation', detail: e.message })
  }
})

app.delete('/api/computations/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' })
  try {
    const [r] = await pool.execute(`DELETE FROM computation_definition WHERE id = ?`, [id])
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true, removed: r.affectedRows })
  } catch (e) {
    logError('COMPUTATION_DELETE_FAIL', e);
    res.status(500).json({ error: 'Failed to delete computation', detail: e.message })
  }
})

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
    logError('COMPUTATION_ATTATCH_FAIL', e);
    res.status(500).json({ error: 'Failed to attach computation', detail: e.message })
  }
})

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
    logError('DETACH_COMPUTATION_FAIL', e)
    res.status(500).json({ error: 'Failed to detach computation', detail: e.message })
  }
})

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
    logError('COMPUTATION_LOAD_FAIL', e);
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

app.get('/api/source-data', async (req, res) => {
  try {
    const where = []
    const params = []
    const { participantId, label, recordScope, from, to } = req.query

    if (participantId && Number.isFinite(Number(participantId))) {
      where.push('participant_id = ?'); params.push(Number(participantId))
    }
    if (label && String(label).trim()) {
      where.push('label = ?'); params.push(String(label).trim())
    }
    if (recordScope && String(recordScope).trim()) {
      // Case-insensitive match on record_scope
      where.push('UPPER(record_scope) = UPPER(?)'); params.push(String(recordScope).trim())
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
      `SELECT id,
              participant_id AS participantId,
              record_scope   AS recordScope,
              label, description,
              metric_date    AS date,
              value, created_at AS createdAt, updated_at AS updatedAt
         FROM source_data
         ${clause}
        ORDER BY metric_date DESC, id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM source_data ${clause}`, params
    )

    res.json({ records: rows, total, limit, offset })
  } catch (e) {
    logError('SOURCEDATA_LIST_FAIL', e);
    res.status(500).json({ error: 'Failed to list source data', detail: e.message })
  }
})

app.post('/api/source-data', async (req, res) => {
  try {
    const { participantId, label, recordScope, description, date, value } = req.body || {}
    const pid = Number(participantId)
    const lbl = (label ?? '').toString().trim()
    const scope = (recordScope ?? 'ACTUAL').toString().trim() || 'ACTUAL'  // default if omitted/blank
    const val = Number(value)
    const d = toInputDate(date)

    if (!Number.isFinite(pid)) return res.status(400).json({ error: 'Invalid participantId' })
    if (!lbl) return res.status(400).json({ error: 'Label is required' })
    if (!d) return res.status(400).json({ error: 'Invalid date (use YYYY-MM-DD)' })
    if (!Number.isFinite(val)) return res.status(400).json({ error: 'Invalid value' })

    const [ins] = await pool.execute(
      `INSERT INTO source_data (participant_id, record_scope, label, description, metric_date, value)
       VALUES (?,?,?,?,?,?)`,
      [pid, scope, lbl, description ?? null, d, val]
    )
    res.status(201).json({ id: ins.insertId })
  } catch (e) {
    logError('SOURCE_DATA_INSERT_FAIL', e);
    res.status(500).json({ error: 'Failed to insert source data', detail: e.message })
  }
})

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
            if (text[i + 1] === '"') { field += '"'; i += 2; continue }
            inQuotes = false; i++; continue
          } else { field += c; i++; continue }
        } else {
          if (c === '"') { inQuotes = true; i++; continue }
          if (c === ',') { row.push(field); field = ''; i++; continue }
          if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++
            row.push(field); rows.push(row); field = ''; row = []; i++; continue
          }
          field += c; i++; continue
        }
      }
      row.push(field); rows.push(row)
      if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0].trim() === '') rows.pop()
      return rows
    }

    const rows = parseCSV(csv)
    if (!rows.length) return res.status(400).json({ error: 'CSV is empty' })

    const header = rows[0].map(h => h.trim().toLowerCase())
    const body = rows.slice(1)

    function idx(...alts) {
      for (const a of alts) {
        const k = a.toLowerCase()
        const i = header.findIndex(h => h === k)
        if (i !== -1) return i
      }
      return -1
    }

    const iPid   = idx('participant id','participant_id','participantid','participant')
    const iScope = idx('record scope','scope','record_scope','recordscope') // NEW (optional)
    const iLbl   = idx('data source label','label','source label','source_label')
    const iDesc  = idx('description','desc','notes')
    const iDate  = idx('date','metric_date','metric date')
    const iVal   = idx('value','amount','val')

    if (iPid < 0 || iLbl < 0 || iDate < 0 || iVal < 0) {
      return res.status(400).json({ error: 'Header row must include Participant ID, Label, Date, Value' })
    }

    const good = []
    const errors = []
    for (let r = 0; r < body.length; r++) {
      const row = body[r]
      const lineNo = r + 2
      const pid = Number(row[iPid])
      const scope = iScope >= 0 ? (row[iScope] ?? '').toString().trim() : 'ACTUAL'
      const lbl = (row[iLbl] ?? '').toString().trim()
      const date = toInputDate(row[iDate])
      const val = Number(row[iVal])
      const desc = (iDesc >= 0 ? row[iDesc] : null) || null

      if (!Number.isFinite(pid)) { errors.push({ line: lineNo, error: 'Invalid participantId', raw: row }); continue }
      if (!lbl) { errors.push({ line: lineNo, error: 'Missing label', raw: row }); continue }
      if (!date) { errors.push({ line: lineNo, error: 'Invalid date', raw: row }); continue }
      if (!Number.isFinite(val)) { errors.push({ line: lineNo, error: 'Invalid value', raw: row }); continue }

      good.push({ pid, scope: scope || 'ACTUAL', lbl, desc, date, val })
    }

    if (!good.length) {
      return res.status(400).json({ error: 'No valid rows', errors })
    }

    // Bulk insert (now includes record_scope)
    const placeholders = good.map(() => '(?,?,?,?,?,?)').join(',')
    const params = []
    for (const g of good) params.push(g.pid, g.scope, g.lbl, g.desc, g.date, g.val)

    await pool.execute(
      `INSERT INTO source_data (participant_id, record_scope, label, description, metric_date, value)
       VALUES ${placeholders}`,
      params
    )

    res.json({ inserted: good.length, errors })
  } catch (e) {
    logError('BULK_INSERT_FAIL', e);
    res.status(500).json({ error: 'Bulk insert failed', detail: e.message })
  }
})

app.delete('/api/source-data/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' })
  try {
    const [r] = await pool.execute(`DELETE FROM source_data WHERE id = ?`, [id])
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true, removed: r.affectedRows })
  } catch (e) {
    logError('SOURCE_DATA_DELETE_FAIL', e);
    res.status(500).json({ error: 'Failed to delete record', detail: e.message })
  }
})

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
    console.error(e);
    logError('SOURCE_DATA_DELETE_FAIL2', e);
    return res.status(500).json({ error: 'Failed to delete source data', detail: e.message })
  }
})

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

    // ---- SECURITY: scan for forbidden keywords before compiling
    const blocked = []
    const safeComps = []
    for (const c of comps) {
      const t = String(c.template || '')
      const m = t.match(FORBIDDEN)
      if (m) {
        blocked.push({ computationId: c.id, name: c.name, keyword: m[0] })
      } else {
        safeComps.push(c)
      }
    }

    // If everything is unsafe, fail fast. Otherwise continue with safe ones and report.
    if (!safeComps.length) {
      await conn.rollback(); conn.release()
      return res.status(400).json({
        error: 'All computation templates blocked by security policy',
        blocked
      })
    }

    // idempotent clear for this plan
    await conn.execute(`DELETE FROM participant_payout_history WHERE plan_id = ?`, [planId])

    // precompile templates (safe only)
    const compiled = new Map()
    for (const c of safeComps) {
      compiled.set(c.id, lodashTemplate(String(c.template || '')))
    }

    // ---- helpers
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
      const descendantIds = getDescendants(participantId)
      const directIds = reportsByManager.get(participantId) || []

      const rollupMeta = {
        scope: descendantIds.length ? 'manager' : 'individual',
        managerId: participantId,
        directReportIds: [...directIds],
        descendantIds: [...descendantIds],
        directReports: directIds.map(id => ({ id, ...(peopleById.get(id) || {}) })),
        descendants:   descendantIds.map(id => ({ id, ...(peopleById.get(id) || {}) }))
      }

      for (const comp of comps) {
        // Skip & record blocked computations
        if (!compiled.has(comp.id)) {
          const t = String(comp.template || '')
          const m = t.match(FORBIDDEN)
          errors.push({
            participantId,
            computationId: comp.id,
            error: `Template blocked by security policy${m ? ` (keyword: ${m[0]})` : ''}`
          })
          continue
        }

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

              directReports: rollupMeta.directReports,
              descendants:   rollupMeta.descendants,
              rollupInfo: () => rollupMeta,

              emit_commission: JSON.stringify,
            }

            // Final belt-and-suspenders check right before render (handles any mutated/loaded strings)
            const maybeUnsafe = String(comp.template || '').match(FORBIDDEN)
            if (maybeUnsafe) {
              errors.push({
                participantId,
                computationId: comp.id,
                error: `Template blocked by security policy at render time (keyword: ${maybeUnsafe[0]})`
              })
              continue
            }

            const rendered = tpl(context) // must use <%= emit_commission(...) %> in template
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
    res.json({
      planId,
      participants: participants.length,
      computations: comps.length,
      periods: periodRows.length || 1,
      inserted,
      blocked, // report what we skipped
      errors
    })
  } catch (e) {
    try { await conn.rollback() } catch {}
    conn.release()
    console.error(e)
    logError('RUN_COMPUTATION_FAIL', e);
    res.status(500).json({ error: 'Run computations failed', detail: e.message })
  }
})

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
    // default to Active unless explicitly 0
    const q = req.query?.isActive
    const isActive = q === '0' ? 0 : 1

    const where = ['pph.participant_id = ?', 'cp.is_active = ?']
    const params = [participantId, isActive]

    const { planId, from, to } = req.query
    if (planId && Number.isFinite(Number(planId))) { where.push('pph.plan_id = ?'); params.push(Number(planId)) }
    const f = toInputDate(from); if (f) { where.push('pph.period_start >= ?'); params.push(f) }
    const t = toInputDate(to);   if (t) { where.push('pph.period_end   <= ?'); params.push(t) }

    const clause = 'WHERE ' + where.join(' AND ')

    const [rows] = await pool.execute(
      `SELECT
         pph.id                 AS id,
         pph.plan_id            AS planId,
         cp.name                AS planName,
         cp.version             AS planVersion,
         cp.is_active           AS isActive,     -- expose flag
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
          isActive: Number(r.isActive),
          periods: []
        })
      }
      const plan = plansMap.get(r.planId)

      const key = `${r.periodStart}|${r.periodEnd}|${r.periodLabel||''}`
      let period = plan.periods.find(p => p._key === key)
      if (!period) {
        period = {
          _key: key,
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

    res.json({ participantId, plans: Array.from(plansMap.values()) })
  } catch (e) {
    logError('PAYOUT_HISTORY_LOAD_FAIL', e);
    res.status(500).json({ error: 'Failed to load payout history', detail: e.message })
  }
})

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
  console.log("body-->", req.body, "params-->", req.params);

  // ★ NEW: normalize recordScopes
  const recordScopesRaw = Array.isArray(req.body?.recordScopes) ? req.body.recordScopes : []
  let recordScopes = recordScopesRaw
    .map(s => String(s || '').trim())
    .filter(Boolean)

  // default to ACTUAL if nothing provided; if '*' present, treat as "all scopes"
  const includeAllScopes = recordScopes.some(s => s === '*')
  if (!includeAllScopes && recordScopes.length === 0) {
    recordScopes = ['ACTUAL']
  }

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
      `SELECT id, name, version, effective_start AS effectiveStart, effective_end AS effectiveEnd, description as description
         FROM comp_plan WHERE id IN (${validPlanIds.map(() => '?').join(',')})`,
      validPlanIds
    )
    //const planById = Object.fromEntries(plans.map(p => [p.id, p]))

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

    // ★ helper to make (UPPER(record_scope) IN (...)) clause
    function buildScopeFilterClause(scopes) {
      if (includeAllScopes) return { sql: '', params: [] }
      const norm = (scopes || []).map(s => s.toUpperCase())
      if (!norm.length) return { sql: ' AND UPPER(record_scope) = UPPER(?) ', params: ['ACTUAL'] }
      const placeholders = norm.map(() => '?').join(',')
      return { sql: ` AND UPPER(record_scope) IN (${placeholders}) `, params: norm }
    }

    async function getSourceRows(startDate, endDate) {
      if (!startDate || !endDate) return []
      const placeholders = participantScopeIds.map(() => '?').join(',')
      const baseParams = [...participantScopeIds, startDate, endDate]
      const scopeFilter = buildScopeFilterClause(recordScopes)

      const [rows] = await conn.execute(
        `SELECT id,
                participant_id AS participantId,
                record_scope   AS recordScope,
                label,
                metric_date    AS date,
                value,
                description
           FROM source_data
          WHERE participant_id IN (${placeholders})
            AND metric_date >= ?
            AND metric_date <= ?
            ${scopeFilter.sql}
          ORDER BY metric_date ASC, id ASC`,
        [...baseParams, ...scopeFilter.params]
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

    // ----------------- Template retrieval + safety (unchanged) -----------------
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

    if (!templateString.trim()) {

      let e = {
        error: "Comp plan template not configured",
        detail: "Add a row in settings with setting_name='comp_plan_template_ejs'."
      };
      console.log(e);
      logError('STMT_GEN_FAIL', e);
      return res.status(500).json(e)
    }

    const m = String(templateString).match(FORBIDDEN)
    if (m) {
      let e = {
        error: 'Template blocked by security policy',
        detail: `Forbidden keyword detected: ${m[0]}`
      };
      console.log(e);

      return res.status(400).json(e)
    }

    // Render AFTER the safety check; expose chosen scopes in the template context
    const html = await ejs.render(templateString, {
      generatedAt: new Date().toLocaleString(),
      participant: pt || { id: participantId },
      plans,
      groupsByPlanId,
      sourceDataByWindow,
      appendix,

      // ★ expose scopes used for this statement
      recordScopes: includeAllScopes ? ['*'] : recordScopes,

      // helpers
      toYMD,
      fmtMoney
    }, { async: true })

    res.setHeader('Content-Type', 'text/html; charset=utf-8')

    //const base64Encoded = Buffer.from(html, "utf-8").toString("base64");
    //console.log(base64Encoded);

    return res.status(200).send(html)

  } catch (e) {
    console.error("e", e);
    logError('RENDER_STATEMENT_FAIL', e);
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
    logError('PAYOUT_SUMMARY_LOAD_FAIL', e);
    res.status(500).json({ error: 'Failed to load payout summary', detail: e.message })
  }
})

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
    logError('DASHBOARD_BUILD_FAIL', e);
    res.status(500).json({ error: 'Failed to build dashboard', detail: e.message })
  } finally {
    try { conn.release() } catch {}
  }
})

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
        schema:  { table: { dropIfExist: true } }, // keep DROP TABLE IF EXISTS
        data:    { format: true },
        trigger: true,
        routine: true,
        view:    true,
      },
    })

    // Rewrite only the `settings` table inserts to REPLACE (prevents 1062 on restore)
    const dataRaw = dump.dump?.data || ''
    const dataFixed = dataRaw.replace(
      /INSERT\s+(?:IGNORE\s+)?INTO\s+`?settings`?\s/gi,
      'REPLACE INTO `settings` '
    )

    const preamble = [
      `-- Dump of database ${DB_NAME} on ${new Date().toISOString()}`,
      'SET FOREIGN_KEY_CHECKS=0;',
    ].join('\n')

    const postamble = 'SET FOREIGN_KEY_CHECKS=1;'

    const sql = [
      preamble,
      dump.dump?.schema  || '',
      dump.dump?.trigger || '',
      dump.dump?.routine || '',
      dump.dump?.view    || '',
      dataFixed,
      postamble,
      '',
    ].join('\n')

    // Backend owns the filename; use .varcac
    const dateStr = new Date().toISOString().slice(0,10) // YYYY-MM-DD
    const fname = `varcac_db_backup-${dateStr}.varcac`

    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`)
    res.status(200).end(sql, 'utf8')
  } catch (e) {
    console.error(e)
    logError('BACKUP_FAIL', e);
    res.status(500).json({ error: 'Backup failed', detail: e.message })
  }
})

async function ensureUniqueIndexOnSettings(pool) {
  const [rows] = await pool.execute('SHOW INDEX FROM `settings`')
  const byName = new Map()
  for (const r of rows) {
    const name = r.Key_name
    const nonUnique = Number(r.Non_unique)
    const seq = Number(r.Seq_in_index)
    const col = r.Column_name
    if (!byName.has(name)) byName.set(name, { nonUnique, cols: [] })
    byName.get(name).cols[seq - 1] = col
  }
  // Unique exactly on (setting_name) already exists?
  for (const { nonUnique, cols } of byName.values()) {
    if (nonUnique === 0 && cols.length === 1 && cols[0] === 'setting_name') return
  }
  // Create only if missing (name might differ in dump)
  try {
    await pool.execute('ALTER TABLE `settings` ADD UNIQUE KEY `uq_settings_setting_name` (`setting_name`)')
  } catch (e) {
    // If name is taken but the constraint doesn't exist under this name,
    // fall back to a fresh unique index name.
    if (String(e?.message || '').match(/Duplicate key name/i)) {
      await pool.execute('CREATE UNIQUE INDEX `uq_settings_setting_name_auto` ON `settings` (`setting_name`)')
    } else {
      throw e
    }
  }
}

function createInsertToReplaceSettingsStream() {
  const decoder = new StringDecoder('utf8')
  let buf = ''
  const re = /insert\s+(?:ignore\s+)?into\s+`?settings`?\s/gi
  return new Transform({
    transform(chunk, _enc, cb) {
      buf += decoder.write(chunk)
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (let line of lines) {
        line = line.replace(re, (m) => m.replace(/insert\s+(?:ignore\s+)?into/i, 'REPLACE INTO'))
        this.push(line + '\n')
      }
      cb()
    },
    flush(cb) {
      this.push(buf.replace(re, (m) => m.replace(/insert\s+(?:ignore\s+)?into/i, 'REPLACE INTO')))
      cb()
    },
  })
}

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
    // A) Drop unique index so old dumps don’t abort
    try {
      await pool.execute('ALTER TABLE `settings` DROP INDEX `uq_settings_setting_name`')
    } catch (e) {
      const msg = String(e?.message || e)
      if (!/drop .*uq_settings_setting_name|does.*exist/i.test(msg)) throw e
    }

    // B) Run mysql and stream the dump safely
    const args = ['-h', DB_HOST, '-P', String(DB_PORT), '-u', DB_USER]
    if (DB_PASSWORD) args.push(`-p${DB_PASSWORD}`)
    args.push('--force') // pragmatic: continue past non-fatal errors
    args.push(DB_NAME)

    const mysql = spawn('mysql', args, { stdio: ['pipe', 'pipe', 'pipe'] })

    let stderr = ''
    mysql.stderr.on('data', (d) => { stderr += d.toString() })

    // Avoid process crash if child closes stdin early
    mysql.stdin.on('error', (err) => {
      if (err?.code !== 'EPIPE') {
        console.warn('mysql.stdin error:', err?.message || err)
      }
    })

    const rs = fs.createReadStream(dumpPath)
    const replacer = createInsertToReplaceSettingsStream()

    // Pipe with backpressure + error propagation
    let pipeErr = null
    const pipePromise = pipe(rs, replacer, mysql.stdin).catch((err) => {
      // EPIPE just means child closed; let close handler decide outcome
      if (!(err && err.code === 'EPIPE')) pipeErr = err
    })

    const closePromise = new Promise((resolve, reject) => {
      mysql.on('close', (code) => {
        if (pipeErr) return reject(pipeErr)
        if (code === 0) return resolve()
        return reject(new Error(stderr || `mysql exited with ${code}`))
      })
    })

    await Promise.all([pipePromise, closePromise])

    // C) De-dupe and re-add unique index
    await pool.execute(`
      DELETE s1
      FROM settings s1
      JOIN settings s2
        ON s1.setting_name = s2.setting_name
       AND s1.id < s2.id
    `)
    await ensureUniqueIndexOnSettings(pool)

    // D) Record the restore
    try {
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
        await pool.execute('UPDATE settings SET setting_value = ? WHERE id = ?', [value, rows[0].id])
      } else {
        await pool.execute('INSERT INTO settings (setting_name, setting_value) VALUES (?, ?)', ['current_restore', value])
      }
    } catch (e) {
      console.warn('Restore completed but failed to write current_restore setting:', e.message)
    }

    // E) Cleanup AFTER streaming is done (prevents ENOENT races)
    await fsp.rm(dumpPath, { force: true })

    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    // Best-effort cleanup if something failed before we opened the stream
    try { await fsp.rm(dumpPath, { force: true }) } catch {}
    logError('RESTORE_FAIL', e);
    res.status(500).json({ error: 'Restore failed', detail: e.message })
  }
})

app.post('/api/admin/factory-reset', async (req, res) => {
  const confirm = req.body?.confirm
  if (confirm !== 'FACTORY') {
    return res.status(400).json({ error: 'Confirmation required: type FACTORY' })
  }

  const DB_HOST = process.env.DB_HOST
  const DB_PORT = Number(process.env.DB_PORT || 3306)
  const DB_USER = process.env.DB_USER
  const DB_PASSWORD = process.env.DB_PASSWORD
  const DB_NAME = process.env.DB_NAME

  // Where to read the initial schema/seed
  const schemaPath = process.env.DB_INIT_PATH || path.join(__dirname, 'db_init.sql')
  console.log(schemaPath);
  try {
    // Sanity: schema file present?
    await fsp.access(schemaPath, fs.constants.R_OK)

    // Step 1: Drop & recreate the database
    await new Promise((resolve, reject) => {
      const args = ['-h', DB_HOST, '-P', String(DB_PORT), '-u', DB_USER]
      if (DB_PASSWORD) args.push(`-p${DB_PASSWORD}`)
      args.push('-e', `DROP DATABASE IF EXISTS \`${DB_NAME}\`; CREATE DATABASE \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`)
      const mysql = spawn('mysql', args, { stdio: ['ignore', 'pipe', 'pipe'] })
      let stderr = ''
      mysql.stderr.on('data', d => { stderr += d.toString() })
      mysql.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(stderr || `mysql exited with ${code}`))
      })
    })

    // Step 2: Import db_init.sql into the fresh DB
    await new Promise((resolve, reject) => {
      const args = ['-h', DB_HOST, '-P', String(DB_PORT), '-u', DB_USER]
      if (DB_PASSWORD) args.push(`-p${DB_PASSWORD}`)
      args.push('--force', DB_NAME)

      const mysql = spawn('mysql', args, { stdio: ['pipe', 'pipe', 'pipe'] })
      let stderr = ''
      mysql.stderr.on('data', d => { stderr += d.toString() })
      mysql.stdin.on('error', (err) => {
        if (err?.code !== 'EPIPE') console.warn('mysql.stdin error:', err?.message || err)
      })

      const rs = fs.createReadStream(schemaPath)
      rs.on('error', reject)
      rs.pipe(mysql.stdin)

      mysql.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(stderr || `mysql exited with ${code}`))
      })
    })

    // Step 3: Make sure settings uniqueness exists (parity with restore flow)
    await ensureUniqueIndexOnSettings(pool)

    // Step 4: Record the reset in `settings`
    try {
      const now = new Date()
      const pad = (n) => String(n).padStart(2, '0')
      const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
      const value = `Factory reset executed at ${ts} from db_init.sql`

      const [rows] = await pool.execute(
        'SELECT id FROM settings WHERE setting_name = ? ORDER BY id DESC LIMIT 1',
        ['current_restore']
      )
      if (rows.length) {
        await pool.execute('UPDATE settings SET setting_value = ? WHERE id = ?', [value, rows[0].id])
      } else {
        await pool.execute('INSERT INTO settings (setting_name, setting_value) VALUES (?, ?)', ['current_restore', value])
      }
    } catch (e) {
      console.warn('Factory reset completed but failed to write current_restore setting:', e.message)
    }

    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    logError('FACTORY_RESET_FAIL', e);
    res.status(500).json({ error: 'Factory reset failed', detail: e.message })
  }
})

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

app.put('/api/settings/:name', async (req, res) => {
  const name = String(req.params.name || '').trim()

  if (!name) return res.status(400).json({ error: 'Missing setting name' })

  // Accept strings only; coerce others (null/undefined become empty string)
  const raw = req.body?.setting_value
  const value = typeof raw === 'string' ? raw : String(raw ?? '')

  // 🔒 Reject unsafe EJS templates
  if (FORBIDDEN.test(value)) {
    return res.status(400).json({
      error: 'Invalid template: forbidden keyword detected'
    })
  }


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
    logError('SAVE_SETTING_FAIL', e);
    return res.status(500).json({ error: 'Failed to save setting', detail: e.message })
  }
})


app.get('/api/payout-history', async (req, res) => {
  try {
    // Parse filters (same as before)
    const pids = String(req.query.participantIds || '')
      .split(',').map(s => Number(s)).filter(Number.isFinite)

    const plids = String(req.query.planIds || '')
      .split(',').map(s => Number(s)).filter(Number.isFinite)

    const where = []
    const args = []
    if (pids.length) { where.push(`pph.participant_id IN (${pids.map(()=>'?').join(',')})`); args.push(...pids) }
    if (plids.length) { where.push(`pph.plan_id IN (${plids.map(()=>'?').join(',')})`); args.push(...plids) }

    // 1) Pull the payout rows (base dataset)
    const sqlHistory = `
      SELECT
        pph.id,
        pph.participant_id,
        pph.plan_id,
        pph.period_label,
        pph.period_start,
        pph.period_end,
        COALESCE(pph.due_date, pph.period_end) AS due_date,
        pph.output_label,
        pph.amount,
        pph.created_at
      FROM participant_payout_history pph
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY pph.period_start, pph.period_end, pph.id
    `
    const [rows] = await pool.execute(sqlHistory, args)
    if (!rows.length) {
      // Keep same shape your CSV layer expects
      return res.json([])
    }

    // 2) Resolve participant & plan names (as you had before)
    const pidSet = new Set(rows.map(r => r.participant_id).filter(v => v != null))
    const plidSet = new Set(rows.map(r => r.plan_id).filter(v => v != null))

    let pMap = new Map()
    if (pidSet.size) {
      const pidList = Array.from(pidSet)
      const [pNameRows] = await pool.execute(
        `SELECT id, TRIM(CONCAT_WS(' ', first_name, last_name)) AS full_name
           FROM plan_participant
          WHERE id IN (${pidList.map(()=>'?').join(',')})`,
        pidList
      )
      pMap = new Map(pNameRows.map(r => [r.id, r.full_name || `Participant ${r.id}`]))
    }

    let planMap = new Map()
    if (plidSet.size) {
      const plidList = Array.from(plidSet)
      const [planNameRows] = await pool.execute(
        `SELECT id, name FROM comp_plan WHERE id IN (${plidList.map(()=>'?').join(',')})`,
        plidList
      )
      planMap = new Map(planNameRows.map(r => [r.id, r.name || `Plan ${r.id}`]))
    }

    // 3) Aggregate DISTINCT record_scope per (participant_id, plan_id, period_start, period_end)
    //    We join source_data on participant_id and date range; then group once.
    const scopeWhere = []
    const scopeArgs = []
    if (pids.length) { scopeWhere.push(`pph.participant_id IN (${pids.map(()=>'?').join(',')})`); scopeArgs.push(...pids) }
    if (plids.length) { scopeWhere.push(`pph.plan_id IN (${plids.map(()=>'?').join(',')})`); scopeArgs.push(...plids) }

    const [scopeRows] = await pool.execute(
      `
      SELECT
        pph.participant_id,
        pph.plan_id,
        pph.period_start,
        pph.period_end,
        GROUP_CONCAT(DISTINCT UPPER(sd.record_scope) ORDER BY UPPER(sd.record_scope) SEPARATOR ', ') AS record_scopes
      FROM participant_payout_history pph
      LEFT JOIN source_data sd
        ON sd.participant_id = pph.participant_id
       AND sd.metric_date   >= pph.period_start
       AND sd.metric_date   <= pph.period_end
      ${scopeWhere.length ? 'WHERE ' + scopeWhere.join(' AND ') : ''}
      GROUP BY pph.participant_id, pph.plan_id, pph.period_start, pph.period_end
      `,
      scopeArgs
    )

    // Build quick lookup by composite key
    const toKey = (r) =>
      `${r.participant_id}|${r.plan_id}|${new Date(r.period_start).toISOString().slice(0,10)}|${new Date(r.period_end).toISOString().slice(0,10)}`
    const scopesByKey = new Map(scopeRows.map(r => [toKey(r), r.record_scopes || '']))

    // 4) Final mapping: replace IDs with names & attach `record_scopes`
    const out = rows.map(r => {
      const key = toKey(r)
      return {
        participant: pMap.get(r.participant_id) || String(r.participant_id ?? ''),
        plan:        planMap.get(r.plan_id)      || String(r.plan_id ?? ''),
        period_label: r.period_label || null,
        period_start: new Date(r.period_start).toISOString().slice(0,10),
        period_end:   new Date(r.period_end).toISOString().slice(0,10),
        due_date:     r.due_date ? new Date(r.due_date).toISOString().slice(0,10) : null,
        output_label: r.output_label,
        amount:       Number(r.amount ?? 0),
        created_at:   r.created_at,
        record_scopes: scopesByKey.get(key) || ''  // ← NEW CSV column
      }
    })

    // If you stream CSV here, keep doing that; if the Reporting Vue does CSV, just return JSON:
    res.json(out)
  } catch (e) {
    console.error('GET /api/payout-history failed:', e)
    logError('PAYOUT_FETCH_FAIL', e);
    res.status(500).json({ error: 'Failed to fetch payout history', detail: e.message })
  }
})

app.get('/api/participants/:id/required-source-inputs', async (req, res) => {
  const participantId = Number(req.params.id)
  if (!Number.isFinite(participantId)) {
    return res.status(400).json({ error: 'Invalid participant id' })
  }

  const splitCSV = (csv) => {
    if (!csv) return []
    return String(csv)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  }

  try {
    // 1) Plans attached to participant
    const [ppRows] = await pool.execute(
      `SELECT pp.plan_id AS planId
         FROM participant_plan pp
        WHERE pp.participant_id = ?`,
      [participantId]
    )
    const planIds = ppRows.map(r => r.planId)
    if (!planIds.length) {
      return res.json({ participantId, allInputs: [], plans: [] })
    }

    // 2) For those plans, pull plan info + computations + inputs
    const placeholders = planIds.map(() => '?').join(',')
    const [rows] = await pool.execute(
      `SELECT
          p.id           AS planId,
          p.name         AS planName,
          p.version      AS planVersion,
          c.id           AS computationId,
          c.name         AS computationName,
          c.source_data_inputs AS inputsCSV
        FROM plan_computation pc
        JOIN comp_plan p              ON p.id = pc.plan_id
        JOIN computation_definition c ON c.id = pc.computation_id
       WHERE pc.plan_id IN (${placeholders})
       ORDER BY p.id ASC, c.name ASC`,
      planIds
    )

    // 3) Build per-plan + overall sets (case-insensitive de-dupe, preserve label casing by uppercasing)
    const plansMap = new Map()
    const allSet = new Set()

    for (const r of rows) {
      if (!plansMap.has(r.planId)) {
        plansMap.set(r.planId, {
          planId: r.planId,
          planName: r.planName,
          planVersion: r.planVersion,
          inputs: new Set(),
          computations: []
        })
      }
      const compInputs = splitCSV(r.inputsCSV).map(s => s.toUpperCase())
      compInputs.forEach(x => allSet.add(x))

      plansMap.get(r.planId).computations.push({
        id: r.computationId,
        name: r.computationName,
        inputs: compInputs
      })
      compInputs.forEach(x => plansMap.get(r.planId).inputs.add(x))
    }

    const plans = [...plansMap.values()].map(p => ({
      planId: p.planId,
      planName: p.planName,
      planVersion: p.planVersion,
      inputs: [...p.inputs].sort(),
      computations: p.computations.map(c => ({
        id: c.id,
        name: c.name,
        inputs: [...new Set(c.inputs)].sort()
      }))
    }))

    res.json({
      participantId,
      allInputs: [...allSet].sort(),
      plans
    })
  } catch (e) {
    console.error(e)
    logError('SOURCE_INPUT_LOAD_FAIL', e);
    res.status(500).json({ error: 'Failed to load required source inputs', detail: e.message })
  }
})

app.patch('/api/plans/:id/active', async (req, res) => {
  const id = Number(req.params.id)
  const isActive = Number(req.body?.isActive)
  if (!Number.isInteger(id) || (isActive !== 0 && isActive !== 1)) {
    return res.status(400).json({ error: 'Invalid id or isActive (must be 0 or 1)' })
  }
  try {
    const [result] = await pool.execute(
      'UPDATE comp_plan SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [isActive, id]
    )
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Plan not found' })
    }
    res.json({ ok: true, id, isActive })
  } catch (e) {
    console.error(e)
    logError('IS_ACTIVE_UPDATE_FAIL', e);
    res.status(500).json({ error: 'Failed to update is_active' })
  }
})

app.post('/api/plans/:id/archive', async (req, res) => {
  req.body = { isActive: 0 }
  return app._router.handle(req, res, () => {}, 'patch', `/api/plans/${req.params.id}/active`)
})

app.post('/api/plans/:id/unarchive', async (req, res) => {
  req.body = { isActive: 1 }
  return app._router.handle(req, res, () => {}, 'patch', `/api/plans/${req.params.id}/active`)
})

async function logError(errorCode, errorObj) {
  try {
    const errorRef = String(errorCode);
    const errorMessage =
      errorObj instanceof Error
        ? errorObj.stack || errorObj.message
        : typeof errorObj === "object"
        ? JSON.stringify(errorObj, null, 2)
        : String(errorObj);

    await pool.execute(
      `INSERT INTO error_logs (error_reference, error_message, time_triggered) VALUES (?, ?, now())`,
      [errorRef, errorMessage]
    );
  } catch (dbErr) {
    console.error("Error logging to database:", dbErr);
  }
}

app.get('/api/error-logs', async (req, res) => {
  const limitRaw = parseInt(req.query.limit, 10)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 10

  try {
    const [rows] = await pool.execute(
      'SELECT id, error_reference, error_message, time_triggered FROM error_logs ORDER BY id DESC LIMIT ?',
      [limit]
    )
    res.json({ data: rows })
  } catch (err) {
    // optional: reuse your logError helper if present
    if (typeof logError === 'function') {
      try { await logError('ERR_LOGS_FETCH_FAIL', err) } catch (_e) {}
    }
    res.status(500).json({ error: 'Failed to fetch error logs' })
  }
})



const SELF_BASE = process.env.DB_HOST + ":3001"
const HUB_BASE  = process.env.STATEMENTHUB_API_BASE || 'https://statementhub.varcac.com'
//const HUB_KEY   = process.env.STATEMENTHUB_API_KEY || ''

async function enqueueOneStatement(participantId, body) {
  // call your existing endpoint
  const url = `http://${SELF_BASE}/api/participants/${participantId}/comp-statement`
  console.log("url-->", url);
  // if your endpoint expects different query params, tweak here:
  const resp = await axios.post(url, body)
  //console.log(resp);
  const rbody = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)
  const b64 = Buffer.from(rbody, 'utf8').toString('base64')
  
  // CSV of plan IDs
  const planCsv = body.planIds.join(',');
  const scopeCsv = body.recordScopes.join(',');

  // Upsert one row per participant (requires UNIQUE KEY on participant_id)
await pool.execute(
    `INSERT INTO statements_outbox
       (participant_id, plan_ids_csv, record_scopes_csv, payload_b64, status)
     VALUES (?, ?, ?, ?, 'PENDING')
     ON DUPLICATE KEY UPDATE
       plan_ids_csv       = VALUES(plan_ids_csv),
       record_scopes_csv  = VALUES(record_scopes_csv),
       payload_b64        = VALUES(payload_b64),
       status             = 'PENDING',
       last_updated       = CURRENT_TIMESTAMP`,
    [participantId, planCsv, scopeCsv, b64]
  )

  return 1
}

async function getAttachedPlanIds(pool, participantId) {
  const [rows] = await pool.query(
    `SELECT plan_id
       FROM participant_plan
      WHERE participant_id = ?`,
    [participantId]
  )
  return rows.map(r => Number(r.plan_id)).filter(Number.isFinite)
}

/**
 * POST /api/statement-hub/calc-enqueue
 * Body: { participantIds: number[], planIds: number[], periodStart: 'YYYY-MM-DD', periodEnd: 'YYYY-MM-DD' }
 * For each combination of participant x plan, call comp-statement endpoint and store base64 in outbox.
 */
app.post('/api/statement-hub/calc-enqueue', async (req, res) => {
  const { participantIds, planIds, scope } = req.body || {}

  console.log(req.body);
  if (!Array.isArray(participantIds) || !participantIds.length ||
      !Array.isArray(planIds)        || !planIds.length ) {
    return res.status(400).json({ error: 'participantIds, planIds, periodStart, periodEnd are required' })
  }


  try {
    const uniqPids = Array.from(new Set(participantIds)).filter(Number.isFinite)

    // sanitize incoming planIds filter (optional)
    const requestedPlanIdSet = Array.isArray(planIds) && planIds.length
      ? new Set(planIds.map(n => Number(n)).filter(Number.isFinite))
      : null

    // sanitize incoming recordScopes -> array of strings (default ['ACTUAL'])
    const recordScopes = Array.isArray(scope) ? scope
                      : Array.isArray(recordScopes) ? recordScopes
                      : Array.isArray(req.body.recordScopes) ? req.body.recordScopes
                      : [String(req.body.scope || 'ACTUAL')]
    const cleanScopes = Array.from(
      new Set(recordScopes.map(s => String(s || '').trim()).filter(Boolean))
    )
    const bodyScopes = cleanScopes.length ? cleanScopes : ['ACTUAL']

    let enqueued = 0

    for (const pid of uniqPids) {
      // only the plans actually attached to this participant
      const attached = await getAttachedPlanIds(pool, pid)

      // if the caller provided planIds, intersect; otherwise use all attached
      const planIdsForPid = requestedPlanIdSet
        ? attached.filter(id => requestedPlanIdSet.has(id))
        : attached

      if (!planIdsForPid.length) continue

      try {
        // single call per participant with the required body shape
        enqueued += await enqueueOneStatement(pid, {
          planIds: planIdsForPid,
          recordScopes: bodyScopes
        })
      } catch (e) {
          await logError('STMT_ENQUEUE_FAIL_PARTICIPANT', e)
      }
    }

    res.json({ enqueued })
  } catch (e) {
    await logError('STMT_ENQUEUE_BULK_FAIL', e)
    res.status(500).json({ error: 'enqueue failed' })
  }
})


app.get('/api/statement-hub/outbox', async (req, res) => {
  const { status } = req.query
  const where = status ? 'WHERE status = ?' : ''
  const params = status ? [status] : []
  try {
    const [rows] = await pool.query(
      `SELECT id, participant_id, plan_ids_csv, record_scopes_csv, last_updated
       FROM statements_outbox
       ${where}
       ORDER BY id DESC
       LIMIT 500`,
      params
    )
    res.json({ data: rows })
  } catch (e) {
    await logError('STMT_OUTBOX_LIST_FAIL', e)
    res.status(500).json({ error: 'list failed' })
  }
})


app.post('/api/statement-hub/push', async (req, res) => {
  const { ids } = req.body || {}
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids required' })

  try {
    const [rows] = await pool.query(
      `SELECT id, participant_ids_csv, plan_ids_csv, payload_b64
       FROM statements_outbox
       WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids
    )

    let pushed = 0
    for (const row of rows) {
      try {
        const hubResp = await axios.post(`${HUB_BASE}/api/statements`, {
          participant_id: row.participant_id,
          plan_id: row.plan_id,
          period_start: row.period_start,
          period_end: row.period_end,
          payload_b64: row.payload_b64,
        }, {
          headers: { Authorization: `Bearer ${HUB_KEY}` },
          timeout: 20000,
        })

        const extId = hubResp?.data?.id || null
        await pool.execute(
          `UPDATE statements_outbox
             SET status='SENT', attempts=attempts+1, external_id=?, sent_at=NOW()
           WHERE id=?`,
          [extId, row.id]
        )
        pushed++
      } catch (e) {
        const msg = (e.response?.data?.error || e.message || 'push failed').slice(0, 5000)
        await pool.execute(
          `UPDATE statements_outbox
             SET status='FAILED', attempts=attempts+1, error_message=?
           WHERE id=?`,
          [msg, row.id]
        )
        await logError('STMT_PUSH_FAIL_ONE', { id: row.id, msg })
      }
    }

    res.json({ requested: ids.length, pushed })
  } catch (e) {
    await logError('STMT_PUSH_BULK_FAIL', e)
    res.status(500).json({ error: 'push failed' })
  }
})


app.get('/api/statement-hub/outbox/:id/payload', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' })
  try {
    const [[row]] = await pool.query(
      `SELECT payload_b64 FROM statements_outbox WHERE id = ?`,
      [id]
    )
    if (!row) return res.status(404).json({ error: 'Not found' })
    res.json({ payload_b64: row.payload_b64 })
  } catch (e) {
    if (typeof logError === 'function') { await logError('STMT_PREVIEW_FETCH_FAIL', e) }
    res.status(500).json({ error: 'Failed to fetch payload' })
  }
})

app.post('/api/statement-hub/delete', async (req, res) => {
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : [])
    .map(n => parseInt(n, 10))
    .filter(Number.isFinite)

  if (!ids.length) return res.status(400).json({ error: 'ids required' })
  try {
    const placeholders = ids.map(() => '?').join(',')
    await pool.execute(
      `DELETE FROM statements_outbox WHERE id IN (${placeholders})`,
      ids
    )
    res.json({ deleted: ids.length })
  } catch (e) {
    if (typeof logError === 'function') { await logError('STMT_DELETE_FAIL', e) }
    res.status(500).json({ error: 'Failed to delete' })
  }
})

// GET /api/payout-history/:id/payload
app.get('/api/payout-history/:id/payload', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' })
  try {
    const [[row]] = await pool.query(
      `SELECT payload FROM participant_payout_history WHERE id = ?`,
      [id]
    )
    if (!row) return res.status(404).json({ error: 'Not found' })
    res.json({ payload: row.payload })
  } catch (e) {
    if (typeof logError === 'function') { await logError('PAYOUT_PAYLOAD_FETCH_FAIL', e) }
    res.status(500).json({ error: 'Failed to fetch payload' })
  }
})

// GET /api/payout-history/resolve
// Resolves a row by composite fields if you don't have ln.id in the UI.
// Params: participantId, planId, periodStart, periodEnd, outputLabel, [createdAt]
app.get('/api/payout-history/resolve', async (req, res) => {
  const {
    participantId, planId, periodStart, periodEnd, outputLabel, createdAt
  } = req.query

  if (!participantId || !planId || !periodStart || !periodEnd || !outputLabel) {
    return res.status(400).json({ error: 'Missing required parameters' })
  }

  try {
    const params = [participantId, planId, periodStart, periodEnd, outputLabel]
    let sql = `
      SELECT id, payload
        FROM participant_payout_history
       WHERE participant_id = ?
         AND plan_id        = ?
         AND period_start   = ?
         AND period_end     = ?
         AND output_label   = ?
    `
    if (createdAt) {
      sql += ` AND created_at >= DATE_SUB(?, INTERVAL 5 MINUTE) AND created_at <= DATE_ADD(?, INTERVAL 5 MINUTE)`
      params.push(createdAt, createdAt)
    }
    sql += ' ORDER BY created_at DESC LIMIT 1'

    const [[row]] = await pool.query(sql, params)
    if (!row) return res.status(404).json({ error: 'Not found' })
    res.json({ id: row.id, payload: row.payload })
  } catch (e) {
    if (typeof logError === 'function') { await logError('PAYOUT_PAYLOAD_RESOLVE_FAIL', e) }
    res.status(500).json({ error: 'Failed to resolve payload' })
  }
})