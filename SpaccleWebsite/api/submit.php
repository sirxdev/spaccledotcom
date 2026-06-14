<?php
/**
 * Spaccle Waitlist API - Submit Endpoint
 * Handles waitlist form submissions
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Only accept POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

require_once 'database.php';

// Get JSON input
$json = file_get_contents('php://input');
$data = json_decode($json, true);

// Validate required fields
$errors = [];

if (empty($data['full_name']) || strlen(trim($data['full_name'])) < 2) {
    $errors[] = 'Full name is required (minimum 2 characters)';
}

if (empty($data['email']) || !filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
    $errors[] = 'Valid email address is required';
}

if (empty($data['plan'])) {
    $errors[] = 'Please select a plan';
}

// Return validation errors
if (!empty($errors)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'Validation failed',
        'errors' => $errors
    ]);
    exit;
}

// Initialize database
$db = new Database();

// Check for duplicate email
if ($db->emailExists($data['email'])) {
    http_response_code(409);
    echo json_encode([
        'success' => false,
        'error' => 'This email is already on the waitlist'
    ]);
    exit;
}

// Generate referral code
$referralCode = 'SP' . strtoupper(substr(md5(uniqid()), 0, 8));

// Prepare submission data
$submissionData = [
    'full_name' => trim($data['full_name']),
    'email' => trim($data['email']),
    'phone' => !empty($data['phone']) ? trim($data['phone']) : null,
    'plan' => $data['plan'],
    'source' => !empty($data['source']) ? $data['source'] : null,
    'referral_code' => $referralCode
];

try {
    // Save to database
    $db->saveSubmission($submissionData);
    
    // Get updated stats
    $stats = $db->getStats();
    
    // Return success response
    echo json_encode([
        'success' => true,
        'message' => 'Successfully joined the waitlist!',
        'data' => [
            'referral_code' => $referralCode,
            'referral_link' => 'https://spaccle.com/waitlist?ref=' . $referralCode,
            'stats' => [
                'total_members' => $stats['total'],
                'your_position' => $stats['total']
            ]
        ]
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Failed to save submission. Please try again.'
    ]);
}
