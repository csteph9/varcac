-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (c) 2025 Caleb Stephens (csteph9@gmail.com)
-- See the LICENSE file in the project root for license information.

CREATE DATABASE IF NOT EXISTS varcac
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE varcac;


-- MariaDB dump 10.19-11.0.2-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: varcac
-- ------------------------------------------------------
-- Server version	11.0.2-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `comp_plan`
--

DROP TABLE IF EXISTS `comp_plan`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `comp_plan` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `version` varchar(32) NOT NULL DEFAULT '1.0',
  `payout_frequency` enum('Monthly','Quarterly','Annual','Semi-Annual','Bi-Weekly','Weekly') DEFAULT NULL,
  `effective_start` date DEFAULT NULL,
  `effective_end` date DEFAULT NULL,
  `description` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_plan_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `computation_definition`
--

DROP TABLE IF EXISTS `computation_definition`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `computation_definition` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `scope` enum('payout','plan') NOT NULL DEFAULT 'payout',
  `template` longtext DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_computation_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `element_definition`
--

DROP TABLE IF EXISTS `element_definition`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `element_definition` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `scope` enum('payout','plan') NOT NULL DEFAULT 'payout',
  `formula` text DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_element_definition_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `formula_library`
--

DROP TABLE IF EXISTS `formula_library`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `formula_library` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `expression` text NOT NULL,
  `description` text DEFAULT NULL,
  `variables_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`variables_json`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `participant_element_value`
--

DROP TABLE IF EXISTS `participant_element_value`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `participant_element_value` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `participant_id` bigint(20) NOT NULL,
  `element_definition_id` bigint(20) NOT NULL,
  `metric_date` date NOT NULL,
  `value` decimal(18,4) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pev_unique` (`participant_id`,`element_definition_id`,`metric_date`),
  KEY `idx_pev_participant` (`participant_id`),
  KEY `idx_pev_element` (`element_definition_id`),
  KEY `idx_pev_date` (`metric_date`),
  CONSTRAINT `fk_pev_element` FOREIGN KEY (`element_definition_id`) REFERENCES `element_definition` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_pev_participant` FOREIGN KEY (`participant_id`) REFERENCES `plan_participant` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `participant_payout_history`
--

DROP TABLE IF EXISTS `participant_payout_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `participant_payout_history` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `plan_id` bigint(20) NOT NULL,
  `participant_id` bigint(20) NOT NULL,
  `computation_id` bigint(20) NOT NULL,
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `period_label` varchar(255) DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `output_label` varchar(255) NOT NULL,
  `amount` decimal(18,4) NOT NULL,
  `payload` longtext DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_pph_plan_part` (`plan_id`,`participant_id`),
  KEY `idx_pph_period` (`period_start`,`period_end`),
  KEY `idx_pph_output_label` (`output_label`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `participant_plan`
--

DROP TABLE IF EXISTS `participant_plan`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `participant_plan` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `participant_id` bigint(20) NOT NULL,
  `plan_id` bigint(20) NOT NULL,
  `effective_start` date DEFAULT NULL,
  `effective_end` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_participant_plan` (`participant_id`,`plan_id`),
  KEY `idx_pp_participant` (`participant_id`),
  KEY `idx_pp_plan` (`plan_id`),
  CONSTRAINT `fk_pp_participant` FOREIGN KEY (`participant_id`) REFERENCES `plan_participant` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_pp_plan` FOREIGN KEY (`plan_id`) REFERENCES `comp_plan` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `plan_calculation_result`
--

DROP TABLE IF EXISTS `plan_calculation_result`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `plan_calculation_result` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `run_id` bigint(20) NOT NULL,
  `plan_id` bigint(20) NOT NULL,
  `participant_id` bigint(20) NOT NULL,
  `element_definition_id` bigint(20) NOT NULL,
  `metric_date` date NOT NULL,
  `input_value` decimal(18,4) NOT NULL,
  `rate` decimal(18,4) DEFAULT NULL,
  `formula` text DEFAULT NULL,
  `computed_value` decimal(18,4) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_res_run` (`run_id`),
  KEY `idx_res_plan` (`plan_id`),
  KEY `idx_res_prt` (`participant_id`),
  KEY `idx_res_elem` (`element_definition_id`),
  CONSTRAINT `fk_calc_result_run` FOREIGN KEY (`run_id`) REFERENCES `plan_calculation_run` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `plan_calculation_run`
--

DROP TABLE IF EXISTS `plan_calculation_run`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `plan_calculation_run` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `plan_id` bigint(20) NOT NULL,
  `run_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `triggered_by` varchar(100) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `totals_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`totals_json`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_calc_run_plan` (`plan_id`),
  CONSTRAINT `fk_calc_run_plan` FOREIGN KEY (`plan_id`) REFERENCES `comp_plan` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `plan_computation`
--

DROP TABLE IF EXISTS `plan_computation`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `plan_computation` (
  `plan_id` bigint(20) NOT NULL,
  `computation_id` bigint(20) NOT NULL,
  PRIMARY KEY (`plan_id`,`computation_id`),
  KEY `fk_pc_comp` (`computation_id`),
  CONSTRAINT `fk_pc_comp` FOREIGN KEY (`computation_id`) REFERENCES `computation_definition` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pc_plan` FOREIGN KEY (`plan_id`) REFERENCES `comp_plan` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `plan_element`
--

DROP TABLE IF EXISTS `plan_element`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `plan_element` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `plan_id` bigint(20) NOT NULL,
  `element_definition_id` bigint(20) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_plan_element` (`plan_id`,`element_definition_id`),
  KEY `fk_plan_element_def` (`element_definition_id`),
  CONSTRAINT `fk_plan_element_def` FOREIGN KEY (`element_definition_id`) REFERENCES `element_definition` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_plan_element_plan` FOREIGN KEY (`plan_id`) REFERENCES `comp_plan` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `plan_participant`
--

DROP TABLE IF EXISTS `plan_participant`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `plan_participant` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `email` varchar(255) NOT NULL,
  `employee_id` varchar(64) NOT NULL,
  `manager_participant_id` bigint(20) DEFAULT NULL,
  `effective_start` date DEFAULT NULL,
  `effective_end` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_participant_email` (`email`),
  KEY `idx_employee_id` (`employee_id`),
  KEY `fk_participant_manager` (`manager_participant_id`),
  CONSTRAINT `fk_participant_manager` FOREIGN KEY (`manager_participant_id`) REFERENCES `plan_participant` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `plan_payout_period`
--

DROP TABLE IF EXISTS `plan_payout_period`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `plan_payout_period` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `plan_id` bigint(20) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `label` varchar(120) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_ppp_plan_start` (`plan_id`,`start_date`),
  KEY `idx_ppp_plan_end` (`plan_id`,`end_date`),
  CONSTRAINT `fk_ppp_plan` FOREIGN KEY (`plan_id`) REFERENCES `comp_plan` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `settings`
--

DROP TABLE IF EXISTS `settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `settings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `setting_name` varchar(100) DEFAULT NULL,
  `setting_value` longtext DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `settings` WRITE;
/*!40000 ALTER TABLE `settings` DISABLE KEYS */;
INSERT INTO `settings` VALUES
(1,'comp_plan_template_ejs','<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\" />\n  <title>Compensation Statement ΓÇö <%= participant?.firstName %> <%= participant?.lastName %></title>\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n  <style>\n    :root {\n      --text: #111;\n      --muted: #666;\n      --hr: #e5e5e5;\n      --table-border: #e5e5e5;\n      --thead-bg: #f5f5f5;\n      --code-bg: #f8f9fa;\n    }\n    * { box-sizing: border-box; }\n    body { margin: 24px; font: 14px/1.5 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, \"Apple Color Emoji\", \"Segoe UI Emoji\"; color: var(--text); }\n    h1, h2, h3 { margin: 0 0 8px 0; }\n    h1 { font-size: 22px; }\n    h2 { font-size: 18px; margin-top: 24px; }\n    h3 { font-size: 16px; margin-top: 16px; }\n    .muted { color: var(--muted); }\n    .hr { border: 0; height: 1px; background: var(--hr); margin: 16px 0; }\n    .section { margin-bottom: 18px; }\n    .tiny { font-size: 12px; }\n    .mono { font-family: ui-monospace, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace; }\n\n    table { width: 100%; border-collapse: collapse; margin: 8px 0 12px 0; }\n    thead th { background: var(--thead-bg); text-align: left; border: 1px solid var(--table-border); padding: 6px 8px; }\n    tbody td { border: 1px solid var(--table-border); padding: 6px 8px; vertical-align: top; }\n    td.num, th.num { text-align: right; }\n\n    .appendix-block { background: var(--code-bg); padding: 10px 12px; border-radius: 6px; overflow: auto; white-space: pre; }\n    .pill { display:inline-block; padding: 2px 8px; border-radius: 999px; background: #eef2ff; color:#3730a3; font-size:12px; margin-left: 8px; }\n    .right { text-align: right; }\n  </style>\n</head>\n<body>\n\n  <header class=\"section\">\n    <h1>VarCAC</h1>\n    <h2>Compensation Statement</h2>\n    <div class=\"muted tiny\">Generated: <%= generatedAt %></div>\n  </header>\n\n  <section class=\"section\">\n    <h2>Participant</h2>\n    <div><strong><%= participant?.firstName %> <%= participant?.lastName %></strong> (ID: <%= participant?.id %>)</div>\n    <% if (participant?.employeeId) { %>\n      <div>Employee ID: <%= participant.employeeId %></div>\n    <% } %>\n    <% if (participant?.email) { %>\n      <div>Email: <%= participant.email %></div>\n    <% } %>\n  </section>\n\n  <% for (const plan of plans){ %>\n    <section class=\"section\">\n      <h2>\n        <%= plan.name %> (v<%= plan.version %>)\n      </h2>\n      <div class=\"muted tiny\">Window: <%= toYMD(plan.effectiveStart) %> ΓåÆ <%= toYMD(plan.effectiveEnd) %></div>\n\n      <% \n        const groups = groupsByPlanId[plan.id] || [];\n        let planTotal = 0;\n      %>\n\n      <% if (!groups.length) { %>\n        <div class=\"muted tiny\">(No payouts found for this plan)</div>\n      <% } %>\n\n      <% for (const g of groups) { %>\n        <h3>\n          <%= g.label %>\n          <% if (g.due) { %><span class=\"pill tiny\">Due: <%= g.due %></span><% } %>\n        </h3>\n        <div class=\"muted tiny\">Window: <%= g.start %> ΓåÆ <%= g.end %></div>\n\n        <!-- Payouts -->\n        <table>\n          <thead>\n            <tr>\n              <th>Computation Applied</th>\n              <th class=\"num\">Amount</th>\n              <th>Created At</th>\n            </tr>\n          </thead>\n          <tbody>\n            <% for (const ln of (g.items || [])) { %>\n              <tr>\n                <td><%= ln.outputLabel || \'ΓÇö\' %></td>\n                <td class=\"num\"><%= fmtMoney(ln.amount) %></td>\n                <td><%= new Date(ln.createdAt).toLocaleString() %></td>\n              </tr>\n            <% } %>\n            <tr>\n              <td class=\"right\"><strong>TOTAL</strong></td>\n              <td class=\"num\"><strong><%= fmtMoney(g.total) %></strong></td>\n              <td></td>\n            </tr>\n          </tbody>\n        </table>\n        <% planTotal += (g.total || 0); %>\n\n        <!-- Source data (manager + DRs) -->\n        <% const srcRows = (sourceDataByWindow[g.key] || []); %>\n        <table>\n          <thead>\n            <tr>\n              <th>Date</th>\n              <th>Data Source Label</th>\n              <th class=\"num\">Value</th>\n              <th>Origin</th>\n              <th>Description</th>\n            </tr>\n          </thead>\n          <tbody>\n            <% if (!srcRows.length) { %>\n              <tr><td colspan=\"5\" class=\"muted tiny\">No source data in this window.</td></tr>\n            <% } %>\n            <% for (const s of srcRows) { %>\n              <tr>\n                <td><%= toYMD(s.date) %></td>\n                <td><%= s.label || \'ΓÇö\' %></td>\n                <td class=\"num\"><%= fmtMoney(s.value) %></td>\n                <td><%= s.origin %></td>\n                <td><%= s.description || \'\' %></td>\n              </tr>\n            <% } %>\n          </tbody>\n        </table>\n\n        <hr class=\"hr\" />\n      <% } %>\n\n      <div><strong>Plan Total: <%= fmtMoney(planTotal) %></strong></div>\n    </section>\n  <% } %>\n\n  <% if (appendix.length) { %>\n    <section class=\"section\">\n      <h2>Appendix: Computation Formulas</h2>\n\n      <% \n        // group appendix by planId\n        const byPlan = {};\n        for (const c of appendix) { (byPlan[c.planId] ||= []).push(c); }\n      %>\n\n      <% for (const p of plans) { \n           const items = byPlan[p.id] || [];\n           if (!items.length) continue;\n      %>\n        <h3><%= p.name %> (v<%= p.version %>)</h3>\n        <% for (const c of items) { %>\n          <div style=\"margin: 8px 0;\">\n            <div><strong><%= c.name %></strong> ΓÇö <%= c.scope %></div>\n            <div class=\"appendix-block mono\"><%= c.template && c.template.length ? c.template : \'// (empty template)\' %></div>\n          </div>\n          <hr class=\"hr\" />\n        <% } %>\n      <% } %>\n    </section>\n  <% } %>\n\n</body>\n</html>\n');
/*!40000 ALTER TABLE `settings` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

--
-- Table structure for table `source_data`
--

DROP TABLE IF EXISTS `source_data`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `source_data` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `participant_id` bigint(20) NOT NULL,
  `label` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `metric_date` date NOT NULL,
  `value` decimal(18,4) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_sd_participant` (`participant_id`),
  KEY `idx_sd_label` (`label`),
  KEY `idx_sd_date` (`metric_date`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-08-17 21:50:38
