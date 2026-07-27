-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "name" TEXT NOT NULL,
    "avatar" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "googleId" TEXT,
    "authProvider" TEXT NOT NULL DEFAULT 'local',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "role" TEXT NOT NULL DEFAULT 'user',
    "status" TEXT NOT NULL DEFAULT 'active',
    "activeToken" TEXT,
    "resetToken" TEXT,
    "resetTokenExpires" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT NOT NULL DEFAULT '',
    "subPlanId" INTEGER,
    "subPlanSlug" TEXT NOT NULL DEFAULT 'free',
    "subStatus" TEXT NOT NULL DEFAULT 'active',
    "subStartedAt" TIMESTAMP(3),
    "subExpiresAt" TIMESTAMP(3),
    "subAutoRenew" BOOLEAN NOT NULL DEFAULT true,
    "queuedPlanId" INTEGER,
    "queuedPlanSlug" TEXT,
    "queuedBillingCycle" TEXT,
    "queuedAmount" DOUBLE PRECISION,
    "queuedStatus" TEXT,
    "queuedPurchasedAt" TIMESTAMP(3),
    "otpCode" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "otpPurpose" TEXT,
    "oddsFormat" TEXT NOT NULL DEFAULT 'decimal',
    "language" TEXT NOT NULL DEFAULT 'en',
    "notifEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifPush" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" DOUBLE PRECISION NOT NULL,
    "yearlyPrice" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "features" TEXT[],
    "maxMarketsTracked" INTEGER NOT NULL DEFAULT 5,
    "apiCallsPerMin" INTEGER NOT NULL DEFAULT 10,
    "advancedAnalytics" BOOLEAN NOT NULL DEFAULT false,
    "bookieBookAccess" BOOLEAN NOT NULL DEFAULT false,
    "predictionEngine" BOOLEAN NOT NULL DEFAULT false,
    "oddsAlerts" BOOLEAN NOT NULL DEFAULT false,
    "telegramNotifications" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSubscription" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "planId" INTEGER NOT NULL,
    "planSlug" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "couponCode" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "paymentMethod" TEXT NOT NULL DEFAULT 'razorpay',
    "gatewayOrderId" TEXT NOT NULL DEFAULT '',
    "gatewayPaymentId" TEXT NOT NULL DEFAULT '',
    "paidAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "ipAddress" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" SERIAL NOT NULL,
    "matchId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL DEFAULT '',
    "marketId" TEXT NOT NULL,
    "eventTypeId" INTEGER NOT NULL DEFAULT 4,
    "competition" TEXT NOT NULL DEFAULT '',
    "eventName" TEXT NOT NULL,
    "teamAName" TEXT NOT NULL,
    "teamASelectionId" INTEGER NOT NULL,
    "teamBName" TEXT NOT NULL,
    "teamBSelectionId" INTEGER NOT NULL,
    "drawSelectionId" INTEGER,
    "matchType" TEXT NOT NULL DEFAULT 'T20',
    "venue" TEXT NOT NULL DEFAULT '',
    "startTime" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPCOMING',
    "inplay" BOOLEAN NOT NULL DEFAULT false,
    "totalMatched" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scoreTeamARuns" INTEGER,
    "scoreTeamAWickets" INTEGER,
    "scoreTeamAOvers" DOUBLE PRECISION,
    "scoreTeamBRuns" INTEGER,
    "scoreTeamBWickets" INTEGER,
    "scoreTeamBOvers" DOUBLE PRECISION,
    "currentInnings" INTEGER NOT NULL DEFAULT 1,
    "tossWinner" TEXT NOT NULL DEFAULT '',
    "battingFirst" TEXT NOT NULL DEFAULT '',
    "resultWinner" TEXT NOT NULL DEFAULT '',
    "settledAt" TIMESTAMP(3),
    "resultVerified" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'betfair',
    "betfairEventId" TEXT NOT NULL DEFAULT '',
    "betfairMarketId" TEXT NOT NULL DEFAULT '',
    "runners" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" SERIAL NOT NULL,
    "adminId" INTEGER NOT NULL,
    "adminEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" INTEGER NOT NULL,
    "targetIdentifier" TEXT NOT NULL DEFAULT '',
    "changesBefore" JSONB,
    "changesAfter" JSONB,
    "reason" TEXT NOT NULL DEFAULT '',
    "ipAddress" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "discountType" TEXT NOT NULL,
    "discountValue" DOUBLE PRECISION NOT NULL,
    "maxDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "applicablePlans" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "usageLimit" INTEGER NOT NULL DEFAULT 0,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "perUserLimit" INTEGER NOT NULL DEFAULT 1,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "description" TEXT NOT NULL DEFAULT '',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE INDEX "User_subPlanSlug_idx" ON "User"("subPlanSlug");

-- CreateIndex
CREATE INDEX "User_subExpiresAt_idx" ON "User"("subExpiresAt");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_slug_key" ON "SubscriptionPlan"("slug");

-- CreateIndex
CREATE INDEX "SubscriptionPlan_isActive_displayOrder_idx" ON "SubscriptionPlan"("isActive", "displayOrder");

-- CreateIndex
CREATE INDEX "UserSubscription_userId_status_idx" ON "UserSubscription"("userId", "status");

-- CreateIndex
CREATE INDEX "UserSubscription_expiresAt_idx" ON "UserSubscription"("expiresAt");

-- CreateIndex
CREATE INDEX "UserSubscription_gatewayOrderId_idx" ON "UserSubscription"("gatewayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Match_matchId_key" ON "Match"("matchId");

-- CreateIndex
CREATE INDEX "Match_status_inplay_idx" ON "Match"("status", "inplay");

-- CreateIndex
CREATE INDEX "Match_startTime_idx" ON "Match"("startTime");

-- CreateIndex
CREATE INDEX "Match_eventTypeId_idx" ON "Match"("eventTypeId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_adminId_idx" ON "AdminAuditLog"("adminId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_targetId_idx" ON "AdminAuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "PromoCode_isActive_validFrom_validUntil_idx" ON "PromoCode"("isActive", "validFrom", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "SiteSettings_key_key" ON "SiteSettings"("key");

-- CreateIndex
CREATE INDEX "SiteSettings_category_idx" ON "SiteSettings"("category");

-- AddForeignKey
ALTER TABLE "SubscriptionPlan" ADD CONSTRAINT "SubscriptionPlan_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteSettings" ADD CONSTRAINT "SiteSettings_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
