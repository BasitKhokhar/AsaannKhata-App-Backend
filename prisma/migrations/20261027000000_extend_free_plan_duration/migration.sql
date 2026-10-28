-- The free plan now lasts about 100 years. Keep existing subscribers on it
-- aligned with the new plan duration without changing paid subscriptions.
UPDATE `SubscriptionPlan`
SET `durationDays` = 36525
WHERE `code` = 'FREE_TRIAL';

UPDATE `UserSubscription` AS `subscription`
JOIN `SubscriptionPlan` AS `plan` ON `plan`.`id` = `subscription`.`planId`
SET `subscription`.`expiryDate` = DATE_ADD(`subscription`.`startDate`, INTERVAL 36525 DAY)
WHERE `plan`.`code` = 'FREE_TRIAL'
  AND `subscription`.`status` IN ('ACTIVE', 'GRACE_PERIOD');
