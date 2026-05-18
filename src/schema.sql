CREATE TABLE IF NOT EXISTS UserTokens (
discord_id BIGINT,
access_token VARCHAR(2048),
refresh_token VARCHAR(2048),
expires_at INTEGER,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
PRIMARY KEY (discord_id),
INDEX idx_expires_at (expires_at) -- Index on expires_at for quick filtering
);
CREATE TABLE IF NOT EXISTS UserStats (
discord_id BIGINT,
streak INTEGER DEFAULT 0,
times_played INTEGER DEFAULT 0,
average_guess_count DECIMAL(4,1) DEFAULT 0,
played_today BOOLEAN DEFAULT FALSE,
PRIMARY KEY (discord_id)
);

CREATE TABLE IF NOT EXISTS TodaysLeaderboard (
discord_id BIGINT,
guess_count INT,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
PRIMARY KEY (discord_id),
INDEX idx_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS SplatdleChannels(
guild_id BIGINT,
channel_id BIGINT,
PRIMARY KEY (guild_id)
);

CREATE TABLE IF NOT EXISTS SplatdleReminders (
discord_id BIGINT PRIMARY KEY,
reminders_enabled BOOLEAN DEFAULT TRUE,
hours_before_reset INT DEFAULT 2,
last_reminder_sent DATETIME,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
INDEX idx_reminders_enabled (reminders_enabled),
INDEX idx_hours_before_reset (hours_before_reset)
);

CREATE TABLE IF NOT EXISTS  drafts (
guild_id BIGINT PRIMARY KEY,
channel_id BIGINT NOT NULL,
message_id BIGINT,
organizer_id BIGINT NOT NULL,
team_size INT NOT NULL,
mode VARCHAR(20) NOT NULL DEFAULT 'standard',
players JSON NOT NULL,
pairs JSON NOT NULL,
pending_invites JSON NOT NULL,
notification_channel_id BIGINT,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
INDEX idx_channel (channel_id),
INDEX idx_created (created_at)
);

CREATE TABLE IF NOT EXISTS SplatdleReminders (
discord_id BIGINT PRIMARY KEY,
reminders_enabled BOOLEAN DEFAULT TRUE,
hours_before_reset INT DEFAULT 2,
last_reminder_sent DATETIME,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
INDEX idx_reminders_enabled (reminders_enabled),
INDEX idx_hours_before_reset (hours_before_reset)
);

CREATE TABLE IF NOT EXISTS confirmed_teams (
id INT AUTO_INCREMENT PRIMARY KEY,
guild_id BIGINT NOT NULL,
channel_id BIGINT NOT NULL,
teams JSON NOT NULL,
voice_category_id BIGINT,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
INDEX idx_guild_created (guild_id, created_at DESC),
INDEX idx_created (created_at)
);
