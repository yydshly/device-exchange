CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`host` text NOT NULL,
	`invite` text NOT NULL,
	`guest` text,
	`offer` text NOT NULL,
	`answer` text,
	`approved` integer DEFAULT 0 NOT NULL,
	`expires` integer NOT NULL
);
