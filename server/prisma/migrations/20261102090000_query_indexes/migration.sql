CREATE INDEX `User_role_createdAt_idx` ON `User` (`role`, `createdAt`);
CREATE INDEX `User_subPlanSlug_subStatus_subExpiresAt_idx` ON `User` (`subPlanSlug`, `subStatus`, `subExpiresAt`);
CREATE INDEX `UserSubscription_userId_createdAt_idx` ON `UserSubscription` (`userId`, `createdAt`);
CREATE INDEX `UserSubscription_planSlug_paymentStatus_userId_idx` ON `UserSubscription` (`planSlug`, `paymentStatus`, `userId`);
CREATE INDEX `AdminAuditLog_action_createdAt_idx` ON `AdminAuditLog` (`action`, `createdAt`);
