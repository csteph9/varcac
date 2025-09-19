-- MariaDB dump 10.19-11.0.2-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: comptally
-- ------------------------------------------------------
-- Server version	11.0.2-MariaDB


CREATE DATABASE IF NOT EXISTS varcac
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE varcac;

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
  `is_active` int(11) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_plan_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=0 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_comp_plan_ai AFTER INSERT ON comp_plan FOR EACH ROW CALL bump_last_mod() */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_comp_plan_au AFTER UPDATE ON comp_plan FOR EACH ROW CALL bump_last_mod() */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_comp_plan_ad AFTER DELETE ON comp_plan FOR EACH ROW CALL bump_last_mod() */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

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
  `source_data_inputs` longtext DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_computation_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=0 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_computation_definition_ai AFTER INSERT ON computation_definition FOR EACH ROW CALL bump_last_mod() */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_computation_definition_au AFTER UPDATE ON computation_definition FOR EACH ROW CALL bump_last_mod() */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_computation_definition_ad AFTER DELETE ON computation_definition FOR EACH ROW CALL bump_last_mod() */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

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
) ENGINE=InnoDB AUTO_INCREMENT=0 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
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
) ENGINE=InnoDB AUTO_INCREMENT=0 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_participant_payout_history_ai AFTER INSERT ON participant_payout_history FOR EACH ROW CALL bump_last_mod() */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_participant_payout_history_au AFTER UPDATE ON participant_payout_history FOR EACH ROW CALL bump_last_mod() */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_participant_payout_history_ad AFTER DELETE ON participant_payout_history FOR EACH ROW CALL bump_last_mod() */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

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
) ENGINE=InnoDB AUTO_INCREMENT=0 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_participant_plan_ai AFTER INSERT ON participant_plan FOR EACH ROW CALL bump_last_mod() */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_participant_plan_au AFTER UPDATE ON participant_plan FOR EACH ROW CALL bump_last_mod() */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_participant_plan_ad AFTER DELETE ON participant_plan FOR EACH ROW CALL bump_last_mod() */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

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
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_plan_computation_ai AFTER INSERT ON plan_computation FOR EACH ROW CALL bump_last_mod() */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_plan_computation_au AFTER UPDATE ON plan_computation FOR EACH ROW CALL bump_last_mod() */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_plan_computation_ad AFTER DELETE ON plan_computation FOR EACH ROW CALL bump_last_mod() */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

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
) ENGINE=InnoDB AUTO_INCREMENT=0 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_plan_participant_ai AFTER INSERT ON plan_participant FOR EACH ROW CALL bump_last_mod() */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_plan_participant_au AFTER UPDATE ON plan_participant FOR EACH ROW CALL bump_last_mod() */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_plan_participant_ad AFTER DELETE ON plan_participant FOR EACH ROW CALL bump_last_mod() */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

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
) ENGINE=InnoDB AUTO_INCREMENT=0 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_plan_payout_period_ai AFTER INSERT ON plan_payout_period  FOR EACH ROW CALL bump_last_mod() */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_plan_payout_period_au AFTER UPDATE ON plan_payout_period  FOR EACH ROW CALL bump_last_mod() */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_plan_payout_period_ad AFTER DELETE ON plan_payout_period  FOR EACH ROW CALL bump_last_mod() */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

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
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_settings_setting_name` (`setting_name`)
) ENGINE=InnoDB AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

INSERT INTO `settings` VALUES
(1,'comp_plan_template_ejs','<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\" />\n  <title>Compensation Statement ΓÇö <%= participant?.firstName %> <%= participant?.lastName %></title>\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n  <style>\n    :root {\n      --text:#111; --muted:#666; --hr:#e5e5e5; --table-border:#e5e5e5; --thead-bg:#f5f5f5; --code-bg:#f8f9fa;\n    }\n    * { box-sizing: border-box; }\n    body { margin:16px; font:13px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,\"Apple Color Emoji\",\"Segoe UI Emoji\"; color:var(--text); }\n    h1,h2,h3 { margin:0 0 6px 0; }\n    h1 { font-size:20px; } h2 { font-size:16px; margin-top:16px; } h3 { font-size:14px; margin-top:12px; }\n    .muted { color:var(--muted); } .tiny{ font-size:12px; }\n    .hr { border:0; height:1px; background:var(--hr); margin:12px 0; }\n    .section { margin-bottom:14px; }\n    .right { text-align:right; }\n\n    table { width:100%; border-collapse:collapse; margin:6px 0 10px 0; }\n    thead th { background:var(--thead-bg); text-align:left; border:1px solid var(--table-border); padding:5px 6px; }\n    tbody td { border:1px solid var(--table-border); padding:5px 6px; vertical-align:top; }\n    td.num, th.num { text-align:right; }\n    .pill { display:inline-block; padding:1px 6px; border-radius:999px; background:#eef2ff; color:#3730a3; font-size:11px; margin-left:6px; }\n\n    .appendix-block { background:var(--code-bg); padding:8px 9px; border-radius:6px; overflow:auto; white-space:pre; }\n  </style>\n</head>\n<body>\n\n  <!-- Header / Participant -->\n  <header class=\"section\">\n    <h1>VarCAC</h1>\n    <div class=\"tiny muted\">Compensation Statement ΓÇó Generated <%= generatedAt %></div>\n    <div><strong><%= participant?.firstName %> <%= participant?.lastName %></strong> (ID: <%= participant?.id %>)</div>\n    <% if (participant?.email) { %><div class=\"tiny\"><%= participant.email %></div><% } %>\n  </header>\n\n  <!-- ===== Summary: one table (plan ├ù date) ===== -->\n  <%\n    \n    const _summary = [];\n    for (const plan of plans) {\n      const groups = groupsByPlanId[plan.id] || [];\n      for (const g of groups) {\n        const dateKey = g.due || g.end || g.start;\n        _summary.push({\n          plan: plan.name + (plan.version ? ` v${plan.version}` : \'\'),\n          period: g.label || `${g.start} ΓåÆ ${g.end}`,\n          date: dateKey,\n          total: Number(g.total || 0),\n        });\n      }\n    }\n    _summary.sort((a,b)=> new Date(a.date) - new Date(b.date) || a.plan.localeCompare(b.plan));\n    const _grand = _summary.reduce((s,r)=> s + (r.total||0), 0);\n  %>\n\n  <section class=\"section\">\n    <h2>Summary</h2>\n    <table>\n      <thead>\n        <tr>\n          <th style=\"width:18%\">Date</th>\n          <th style=\"width:32%\">Plan</th>\n          <th>Period</th>\n          <th class=\"num\" style=\"width:18%\">Payable</th>\n        </tr>\n      </thead>\n      <tbody>\n        <% if (!_summary.length) { %>\n          <tr><td colspan=\"4\" class=\"muted tiny\">No payouts available.</td></tr>\n        <% } %>\n        <% for (const r of _summary) { %>\n          <tr>\n            <td><%= toYMD(r.date) %></td>\n            <td><%= r.plan %></td>\n            <td><%= r.period %></td>\n            <td class=\"num\"><%= fmtMoney(r.total) %></td>\n          </tr>\n        <% } %>\n        <% if (_summary.length) { %>\n          <tr>\n            <td></td><td></td>\n            <td class=\"right\"><strong>Grand Total</strong></td>\n            <td class=\"num\"><strong><%= fmtMoney(_grand) %></strong></td>\n          </tr>\n        <% } %>\n      </tbody>\n    </table>\n  </section>\n\n  <!-- ===== Detailed breakdown (condensed) ===== -->\n  <% for (const plan of plans){ %>\n    <section class=\"section\">\n      <h2><%= plan.name %><% if (plan.version) { %> <span class=\"tiny muted\">v<%= plan.version %></span><% } %></h2>\n      <div class=\"tiny muted\">Window: <%= toYMD(plan.effectiveStart) %> ΓåÆ <%= toYMD(plan.effectiveEnd) %></div>\n\n      <%\n        const groups = (groupsByPlanId[plan.id] || []).slice().sort((a,b)=> new Date(a.due) - new Date(b.due));\n        let planTotal = 0;\n      %>\n\n      <% if (!groups.length) { %>\n        <div class=\"tiny muted\">(No payouts found for this plan)</div>\n      <% } %>\n\n      <% for (const g of groups) { %>\n        <h3>\n          <%= g.label %>\n          <% if (g.due) { %><span class=\"pill tiny\">Due: <%= toYMD(g.due) %></span><% } %>\n          <span class=\"tiny muted\"> ΓÇó <%= g.start %> ΓåÆ <%= g.end %></span>\n        </h3>\n\n        <!-- Payout lines (condensed) -->\n        <table>\n          <thead>\n            <tr>\n              <th>Computation</th>\n              <th class=\"num\">Amount</th>\n              <th>Created</th>\n            </tr>\n          </thead>\n          <tbody>\n            <% for (const ln of (g.items || [])) { %>\n              <tr>\n                <td><%= ln.outputLabel || \'ΓÇö\' %></td>\n                <td class=\"num\"><%= fmtMoney(ln.amount) %></td>\n                <td class=\"tiny\"><%= new Date(ln.createdAt).toLocaleString() %></td>\n              </tr>\n            <% } %>\n            <tr>\n              <td class=\"right\"><strong>Total</strong></td>\n              <td class=\"num\"><strong><%= fmtMoney(g.total) %></strong></td>\n              <td></td>\n            </tr>\n          </tbody>\n        </table>\n        <% planTotal += (g.total || 0); %>\n\n        <!-- Source data (only render if present to save space) -->\n        <% const srcRows = (sourceDataByWindow[g.key] || []); %>\n        <% if (srcRows.length) { %>\n          <table>\n            <thead>\n              <tr>\n                <th style=\"width:16%\">Date</th>\n                <th style=\"width:28%\">Data Source</th>\n                <th class=\"num\" style=\"width:14%\">Value</th>\n                <th style=\"width:18%\">Origin</th>\n                <th>Description</th>\n              </tr>\n            </thead>\n            <tbody>\n              <% for (const s of srcRows) { %>\n                <tr>\n                  <td><%= toYMD(s.date) %></td>\n                  <td><%= s.label || \'ΓÇö\' %></td>\n                  <td class=\"num\"><%= fmtMoney(s.value) %></td>\n                  <td class=\"tiny\"><%= s.origin %></td>\n                  <td class=\"tiny\"><%= s.description || \'\' %></td>\n                </tr>\n              <% } %>\n            </tbody>\n          </table>\n        <% } %>\n\n        <hr class=\"hr\" />\n      <% } %>\n\n      <div class=\"right\"><strong>Plan Total: <%= fmtMoney(planTotal) %></strong></div>\n    </section>\n  <% } %>\n\n  <% if (appendix.length) { %>\n    <section class=\"section\">\n      <h2>Appendix: Computation Formulas</h2>\n      <%\n        const byPlan = {};\n        for (const c of appendix) { (byPlan[c.planId] ||= []).push(c); }\n      %>\n      <% for (const p of plans) {\n           const items = byPlan[p.id] || [];\n           if (!items.length) continue;\n      %>\n        <h3><%= p.name %><% if (p.version) { %> <span class=\"tiny muted\">v<%= p.version %></span><% } %></h3>\n        <% for (const c of items) { %>\n          <div style=\"margin:6px 0;\">\n            <div><strong><%= c.name %></strong> ΓÇö <span class=\"tiny muted\"><%= c.scope %></span></div>\n            <div class=\"appendix-block\"><%= c.template && c.template.length ? c.template : \'// (empty template)\' %></div>\n          </div>\n          <hr class=\"hr\" />\n        <% } %>\n      <% } %>\n    </section>\n  <% } %>\n\n</body>\n</html>\n');


--
-- Table structure for table `source_data`
--

DROP TABLE IF EXISTS `source_data`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `source_data` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `participant_id` bigint(20) NOT NULL,
  `record_scope` varchar(255) DEFAULT NULL,
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
) ENGINE=InnoDB AUTO_INCREMENT=0 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_source_data_ai AFTER INSERT ON source_data FOR EACH ROW CALL bump_last_mod() */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_source_data_au AFTER UPDATE ON source_data FOR EACH ROW CALL bump_last_mod() */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_source_data_ad AFTER DELETE ON source_data FOR EACH ROW CALL bump_last_mod() */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Dumping events for database 'comptally'
--

--
-- Dumping routines for database 'comptally'
--
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP PROCEDURE IF EXISTS `bump_last_mod` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` PROCEDURE `bump_last_mod`()
BEGIN
  INSERT INTO settings (setting_name, setting_value)
  VALUES ('last_record_modification_date', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%sZ'))
  ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
END ;;
DELIMITER ;



DELIMITER //

-- 1) Stored procedure used by all triggers
DROP PROCEDURE IF EXISTS bump_last_mod//
CREATE PROCEDURE bump_last_mod()
MODIFIES SQL DATA
BEGIN
  INSERT INTO settings (setting_name, setting_value)
  VALUES ('last_mod', CURRENT_TIMESTAMP())
  ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
END//

-- 2) Triggers (drop & recreate)
-- comp_plan
DROP TRIGGER IF EXISTS `trg_comp_plan_ai`//
CREATE TRIGGER `trg_comp_plan_ai` AFTER INSERT ON `comp_plan`
FOR EACH ROW CALL bump_last_mod()//
DROP TRIGGER IF EXISTS `trg_comp_plan_au`//
CREATE TRIGGER `trg_comp_plan_au` AFTER UPDATE ON `comp_plan`
FOR EACH ROW CALL bump_last_mod()//
DROP TRIGGER IF EXISTS `trg_comp_plan_ad`//
CREATE TRIGGER `trg_comp_plan_ad` AFTER DELETE ON `comp_plan`
FOR EACH ROW CALL bump_last_mod()//

-- computation_definition
DROP TRIGGER IF EXISTS `trg_computation_definition_ai`//
CREATE TRIGGER `trg_computation_definition_ai` AFTER INSERT ON `computation_definition`
FOR EACH ROW CALL bump_last_mod()//
DROP TRIGGER IF EXISTS `trg_computation_definition_au`//
CREATE TRIGGER `trg_computation_definition_au` AFTER UPDATE ON `computation_definition`
FOR EACH ROW CALL bump_last_mod()//
DROP TRIGGER IF EXISTS `trg_computation_definition_ad`//
CREATE TRIGGER `trg_computation_definition_ad` AFTER DELETE ON `computation_definition`
FOR EACH ROW CALL bump_last_mod()//

-- participant_payout_history
DROP TRIGGER IF EXISTS `trg_participant_payout_history_ai`//
CREATE TRIGGER `trg_participant_payout_history_ai` AFTER INSERT ON `participant_payout_history`
FOR EACH ROW CALL bump_last_mod()//
DROP TRIGGER IF EXISTS `trg_participant_payout_history_au`//
CREATE TRIGGER `trg_participant_payout_history_au` AFTER UPDATE ON `participant_payout_history`
FOR EACH ROW CALL bump_last_mod()//
DROP TRIGGER IF EXISTS `trg_participant_payout_history_ad`//
CREATE TRIGGER `trg_participant_payout_history_ad` AFTER DELETE ON `participant_payout_history`
FOR EACH ROW CALL bump_last_mod()//

-- participant_plan
DROP TRIGGER IF EXISTS `trg_participant_plan_ai`//
CREATE TRIGGER `trg_participant_plan_ai` AFTER INSERT ON `participant_plan`
FOR EACH ROW CALL bump_last_mod()//
DROP TRIGGER IF EXISTS `trg_participant_plan_au`//
CREATE TRIGGER `trg_participant_plan_au` AFTER UPDATE ON `participant_plan`
FOR EACH ROW CALL bump_last_mod()//
DROP TRIGGER IF EXISTS `trg_participant_plan_ad`//
CREATE TRIGGER `trg_participant_plan_ad` AFTER DELETE ON `participant_plan`
FOR EACH ROW CALL bump_last_mod()//

-- plan_computation
DROP TRIGGER IF EXISTS `trg_plan_computation_ai`//
CREATE TRIGGER `trg_plan_computation_ai` AFTER INSERT ON `plan_computation`
FOR EACH ROW CALL bump_last_mod()//
DROP TRIGGER IF EXISTS `trg_plan_computation_au`//
CREATE TRIGGER `trg_plan_computation_au` AFTER UPDATE ON `plan_computation`
FOR EACH ROW CALL bump_last_mod()//
DROP TRIGGER IF EXISTS `trg_plan_computation_ad`//
CREATE TRIGGER `trg_plan_computation_ad` AFTER DELETE ON `plan_computation`
FOR EACH ROW CALL bump_last_mod()//

-- plan_participant
DROP TRIGGER IF EXISTS `trg_plan_participant_ai`//
CREATE TRIGGER `trg_plan_participant_ai` AFTER INSERT ON `plan_participant`
FOR EACH ROW CALL bump_last_mod()//
DROP TRIGGER IF EXISTS `trg_plan_participant_au`//
CREATE TRIGGER `trg_plan_participant_au` AFTER UPDATE ON `plan_participant`
FOR EACH ROW CALL bump_last_mod()//
DROP TRIGGER IF EXISTS `trg_plan_participant_ad`//
CREATE TRIGGER `trg_plan_participant_ad` AFTER DELETE ON `plan_participant`
FOR EACH ROW CALL bump_last_mod()//

-- plan_payout_period
DROP TRIGGER IF EXISTS `trg_plan_payout_period_ai`//
CREATE TRIGGER `trg_plan_payout_period_ai` AFTER INSERT ON `plan_payout_period`
FOR EACH ROW CALL bump_last_mod()//
DROP TRIGGER IF EXISTS `trg_plan_payout_period_au`//
CREATE TRIGGER `trg_plan_payout_period_au` AFTER UPDATE ON `plan_payout_period`
FOR EACH ROW CALL bump_last_mod()//
DROP TRIGGER IF EXISTS `trg_plan_payout_period_ad`//
CREATE TRIGGER `trg_plan_payout_period_ad` AFTER DELETE ON `plan_payout_period`
FOR EACH ROW CALL bump_last_mod()//

-- source_data
DROP TRIGGER IF EXISTS `trg_source_data_ai`//
CREATE TRIGGER `trg_source_data_ai` AFTER INSERT ON `source_data`
FOR EACH ROW CALL bump_last_mod()//
DROP TRIGGER IF EXISTS `trg_source_data_au`//
CREATE TRIGGER `trg_source_data_au` AFTER UPDATE ON `source_data`
FOR EACH ROW CALL bump_last_mod()//
DROP TRIGGER IF EXISTS `trg_source_data_ad`//
CREATE TRIGGER `trg_source_data_ad` AFTER DELETE ON `source_data`
FOR EACH ROW CALL bump_last_mod()//

DELIMITER ;



/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-09-11 18:47:27
