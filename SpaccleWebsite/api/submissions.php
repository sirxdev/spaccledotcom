<?php
/**
 * Spaccle Waitlist API - Get Submissions Endpoint
 * Retrieves waitlist submissions for admin dashboard
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Only accept GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

require_once 'database.php';

// Initialize database
$db = new Database();

// Get query parameters
$filters = [
    'plan' => $_GET['plan'] ?? null,
    'source' => $_GET['source'] ?? null,
    'search' => $_GET['search'] ?? null,
    'date_from' => $_GET['date_from'] ?? null,
    'date_to' => $_GET['date_to'] ?? null
];

// Remove empty filters
$filters = array_filter($filters);

// Pagination
$page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
$limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 50;
$offset = ($page - 1) * $limit;

try {
    // Get submissions
    $submissions = $db->getAllSubmissions($filters, $limit, $offset);
    
    // Get total count for pagination
    $totalCount = $db->getSubmissionCount($filters);
    
    // Get stats
    $stats = $db->getStats();
    
    // Return response
    echo json_encode([
        'success' => true,
        'data' => [
            'submissions' => $submissions,
            'pagination' => [
                'page' => $page,
                'limit' => $limit,
                'total' => $totalCount,
                'pages' => ceil($totalCount / $limit)
            ],
            'stats' => $stats
        ]
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Failed to retrieve submissions'
    ]);
}
