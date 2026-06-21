CREATE TABLE IF NOT EXISTS meal_plan_jobs (
    id            VARCHAR(36)  PRIMARY KEY,
    user_id       VARCHAR(100) NOT NULL DEFAULT 'default',
    status        VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    result_json   TEXT,
    error_message TEXT,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_job_user_status ON meal_plan_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_job_created     ON meal_plan_jobs(created_at);
