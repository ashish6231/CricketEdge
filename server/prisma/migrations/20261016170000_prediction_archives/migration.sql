CREATE TABLE IF NOT EXISTS `PredictionDataset` (
  `id` VARCHAR(64) NOT NULL,
  `metadata` LONGTEXT NOT NULL,
  `initialized` BOOLEAN NOT NULL DEFAULT false,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `PredictionRecord` (
  `id` VARCHAR(64) NOT NULL,
  `datasetKey` VARCHAR(64) NOT NULL,
  `recordKey` VARCHAR(191) NOT NULL,
  `payload` LONGTEXT NOT NULL,
  `position` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `PredictionRecord_datasetKey_recordKey_key` (`datasetKey`, `recordKey`),
  INDEX `PredictionRecord_datasetKey_position_idx` (`datasetKey`, `position`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
