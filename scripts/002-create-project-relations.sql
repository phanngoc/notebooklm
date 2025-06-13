-- Tạo bảng projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Thêm project_id vào bảng sources
ALTER TABLE sources 
ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- Thêm project_id vào bảng notes
ALTER TABLE notes 
ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- Thêm project_id vào bảng chat_sessions
ALTER TABLE chat_sessions 
ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- Tạo các index cho project_id
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_sources_project_id ON sources(project_id);
CREATE INDEX IF NOT EXISTS idx_notes_project_id ON notes(project_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_project_id ON chat_sessions(project_id);

-- Tạo các ràng buộc để đảm bảo tính toàn vẹn dữ liệu
ALTER TABLE sources
ADD CONSTRAINT fk_sources_project
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE notes
ADD CONSTRAINT fk_notes_project
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE chat_sessions
ADD CONSTRAINT fk_chat_sessions_project
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- Tạo các view để dễ dàng truy vấn
CREATE OR REPLACE VIEW project_sources AS
SELECT p.id as project_id, p.name as project_name, s.*
FROM projects p
JOIN sources s ON s.project_id = p.id;

CREATE OR REPLACE VIEW project_notes AS
SELECT p.id as project_id, p.name as project_name, n.*
FROM projects p
JOIN notes n ON n.project_id = p.id;

CREATE OR REPLACE VIEW project_chat_sessions AS
SELECT p.id as project_id, p.name as project_name, cs.*
FROM projects p
JOIN chat_sessions cs ON cs.project_id = p.id; 