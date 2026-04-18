exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE crm_leads
      ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES crm_pipelines(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS pipeline_stage_id UUID REFERENCES crm_pipeline_stages(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS estimated_revenue NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS industry TEXT,
      ADD COLUMN IF NOT EXISTS notes TEXT;

    CREATE INDEX IF NOT EXISTS crm_leads_pipeline_id_idx ON crm_leads(pipeline_id);
    CREATE INDEX IF NOT EXISTS crm_leads_pipeline_stage_id_idx ON crm_leads(pipeline_stage_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS crm_leads_pipeline_id_idx;
    DROP INDEX IF EXISTS crm_leads_pipeline_stage_id_idx;
    ALTER TABLE crm_leads
      DROP COLUMN IF EXISTS pipeline_id,
      DROP COLUMN IF EXISTS pipeline_stage_id,
      DROP COLUMN IF EXISTS estimated_revenue,
      DROP COLUMN IF EXISTS industry,
      DROP COLUMN IF EXISTS notes;
  `);
};
