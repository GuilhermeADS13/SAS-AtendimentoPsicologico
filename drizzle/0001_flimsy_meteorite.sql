CREATE TABLE `appointments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`therapistId` int NOT NULL,
	`patientId` int NOT NULL,
	`scheduledAt` datetime NOT NULL,
	`duration` int NOT NULL DEFAULT 60,
	`status` enum('scheduled','completed','cancelled','no_show') NOT NULL DEFAULT 'scheduled',
	`notes` longtext,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appointments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`therapistId` int NOT NULL,
	`sessionId` int,
	`fileName` varchar(256) NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`fileUrl` text NOT NULL,
	`fileType` varchar(50) NOT NULL,
	`fileSize` int NOT NULL,
	`documentType` enum('prescription','report','exam','attachment','other') NOT NULL DEFAULT 'other',
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`appointmentId` int NOT NULL,
	`recipientType` enum('therapist','patient') NOT NULL,
	`recipientEmail` varchar(320) NOT NULL,
	`notificationType` enum('appointment_reminder','appointment_confirmation','appointment_cancelled','new_appointment') NOT NULL,
	`status` enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
	`sentAt` datetime,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `patients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`therapistId` int NOT NULL,
	`firstName` varchar(128) NOT NULL,
	`lastName` varchar(128) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(20),
	`dateOfBirth` datetime,
	`address` text,
	`medicalHistory` longtext,
	`emergencyContact` varchar(128),
	`emergencyPhone` varchar(20),
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `patients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`appointmentId` int NOT NULL,
	`patientId` int NOT NULL,
	`therapistId` int NOT NULL,
	`startedAt` datetime NOT NULL,
	`endedAt` datetime,
	`clinicalNotes` longtext,
	`treatment` longtext,
	`nextSteps` longtext,
	`mood` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `therapists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`crp` varchar(64) NOT NULL,
	`specialties` text,
	`bio` longtext,
	`photoUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `therapists_id` PRIMARY KEY(`id`),
	CONSTRAINT `therapists_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `videoCalls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int,
	`appointmentId` int NOT NULL,
	`therapistId` int NOT NULL,
	`patientId` int NOT NULL,
	`roomId` varchar(256) NOT NULL,
	`startedAt` datetime NOT NULL,
	`endedAt` datetime,
	`duration` int,
	`recordingUrl` text,
	`status` enum('waiting','active','completed','failed') NOT NULL DEFAULT 'waiting',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `videoCalls_id` PRIMARY KEY(`id`),
	CONSTRAINT `videoCalls_roomId_unique` UNIQUE(`roomId`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','therapist','patient') NOT NULL DEFAULT 'user';