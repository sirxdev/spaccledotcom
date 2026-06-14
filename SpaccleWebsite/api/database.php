<?php
/**
 * Spaccle Waitlist Database Handler
 * Manages SQLite database connection and operations
 */

class Database {
    private $db;
    private $dbPath;
    
    public function __construct() {
        $this->dbPath = __DIR__ . '/waitlist.db';
        $this->connect();
        $this->createTables();
    }
    
    private function connect() {
        try {
            $this->db = new PDO('sqlite:' . $this->dbPath);
            $this->db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $this->db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
            exit;
        }
    }
    
    private function createTables() {
        $sql = "CREATE TABLE IF NOT EXISTS waitlist_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT,
            plan TEXT NOT NULL,
            source TEXT,
            referral_code TEXT,
            ip_address TEXT,
            user_agent TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )";
        
        $this->db->exec($sql);
        
        // Create index for faster queries
        $this->db->exec("CREATE INDEX IF NOT EXISTS idx_email ON waitlist_submissions(email)");
        $this->db->exec("CREATE INDEX IF NOT EXISTS idx_plan ON waitlist_submissions(plan)");
        $this->db->exec("CREATE INDEX IF NOT EXISTS idx_created_at ON waitlist_submissions(created_at)");
    }
    
    public function getDb() {
        return $this->db;
    }
    
    public function saveSubmission($data) {
        $sql = "INSERT INTO waitlist_submissions 
                (full_name, email, phone, plan, source, referral_code, ip_address, user_agent) 
                VALUES 
                (:full_name, :email, :phone, :plan, :source, :referral_code, :ip_address, :user_agent)";
        
        $stmt = $this->db->prepare($sql);
        
        $stmt->bindValue(':full_name', $data['full_name'], PDO::PARAM_STR);
        $stmt->bindValue(':email', $data['email'], PDO::PARAM_STR);
        $stmt->bindValue(':phone', $data['phone'] ?? null, PDO::PARAM_STR);
        $stmt->bindValue(':plan', $data['plan'], PDO::PARAM_STR);
        $stmt->bindValue(':source', $data['source'] ?? null, PDO::PARAM_STR);
        $stmt->bindValue(':referral_code', $data['referral_code'] ?? null, PDO::PARAM_STR);
        $stmt->bindValue(':ip_address', $_SERVER['REMOTE_ADDR'] ?? null, PDO::PARAM_STR);
        $stmt->bindValue(':user_agent', $_SERVER['HTTP_USER_AGENT'] ?? null, PDO::PARAM_STR);
        
        return $stmt->execute();
    }
    
    public function getAllSubmissions($filters = [], $limit = 100, $offset = 0) {
        $sql = "SELECT * FROM waitlist_submissions WHERE 1=1";
        $params = [];
        
        if (!empty($filters['plan'])) {
            $sql .= " AND plan = :plan";
            $params[':plan'] = $filters['plan'];
        }
        
        if (!empty($filters['source'])) {
            $sql .= " AND source = :source";
            $params[':source'] = $filters['source'];
        }
        
        if (!empty($filters['search'])) {
            $sql .= " AND (full_name LIKE :search OR email LIKE :search)";
            $params[':search'] = '%' . $filters['search'] . '%';
        }
        
        if (!empty($filters['date_from'])) {
            $sql .= " AND created_at >= :date_from";
            $params[':date_from'] = $filters['date_from'];
        }
        
        if (!empty($filters['date_to'])) {
            $sql .= " AND created_at <= :date_to";
            $params[':date_to'] = $filters['date_to'];
        }
        
        $sql .= " ORDER BY created_at DESC LIMIT :limit OFFSET :offset";
        
        $stmt = $this->db->prepare($sql);
        
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        
        $stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', (int)$offset, PDO::PARAM_INT);
        
        $stmt->execute();
        return $stmt->fetchAll();
    }
    
    public function getSubmissionCount($filters = []) {
        $sql = "SELECT COUNT(*) as count FROM waitlist_submissions WHERE 1=1";
        $params = [];
        
        if (!empty($filters['plan'])) {
            $sql .= " AND plan = :plan";
            $params[':plan'] = $filters['plan'];
        }
        
        if (!empty($filters['source'])) {
            $sql .= " AND source = :source";
            $params[':source'] = $filters['source'];
        }
        
        $stmt = $this->db->prepare($sql);
        
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        
        $stmt->execute();
        $result = $stmt->fetch();
        return $result['count'];
    }
    
    public function getStats() {
        $stats = [];
        
        // Total submissions
        $stmt = $this->db->query("SELECT COUNT(*) as total FROM waitlist_submissions");
        $stats['total'] = $stmt->fetch()['total'];
        
        // Submissions by plan
        $stmt = $this->db->query("SELECT plan, COUNT(*) as count FROM waitlist_submissions GROUP BY plan");
        $stats['by_plan'] = $stmt->fetchAll();
        
        // Today's submissions
        $stmt = $this->db->query("SELECT COUNT(*) as today FROM waitlist_submissions WHERE DATE(created_at) = DATE('now')");
        $stats['today'] = $stmt->fetch()['today'];
        
        // This week's submissions
        $stmt = $this->db->query("SELECT COUNT(*) as this_week FROM waitlist_submissions WHERE created_at >= datetime('now', '-7 days')");
        $stats['this_week'] = $stmt->fetch()['this_week'];
        
        return $stats;
    }
    
    public function emailExists($email) {
        $stmt = $this->db->prepare("SELECT COUNT(*) as count FROM waitlist_submissions WHERE email = :email");
        $stmt->bindValue(':email', $email, PDO::PARAM_STR);
        $stmt->execute();
        $result = $stmt->fetch();
        return $result['count'] > 0;
    }
}
