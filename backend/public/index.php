<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/Response.php';
require_once dirname(__DIR__) . '/lib/VndbClient.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-Vndb-Token');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$path = rtrim($path, '/') ?: '/';

if ($method === 'GET' && ($path === '/health' || $path === '')) {
    json_ok(['ok' => true, 'service' => 'f95template-vndb-proxy']);
}

if ($method === 'POST' && $path === '/v1/vn/lookup') {
    $raw = file_get_contents('php://input') ?: '';
    $in = json_decode($raw, true);
    if (!is_array($in)) {
        json_err(400, 'JSON body required');
    }
    $id = isset($in['id']) ? trim((string) $in['id']) : null;
    $search = isset($in['search']) ? trim((string) $in['search']) : null;
    if (($id === null || $id === '') && ($search === null || $search === '')) {
        json_err(400, 'Provide id or search');
    }

    $vndbTok = '';
    if (isset($in['vndb_token'])) {
        $vndbTok = trim((string) $in['vndb_token']);
    }
    unset($in['vndb_token']);
    if ($vndbTok === '') {
        $vndbTok = trim((string) ($_SERVER['HTTP_X_VNDB_TOKEN'] ?? ''));
    }
    if ($vndbTok === '') {
        json_err(400, 'VNDB token required: include vndb_token in the JSON body or X-Vndb-Token header');
    }

    $client = new VndbClient($vndbTok);
    $vn = $client->lookupVn($id, $search);
    if ($vn === null) {
        json_ok(['vn' => null, 'message' => 'No matching visual novel']);
    }
    json_ok(['vn' => $vn]);
}

json_err(404, 'Not found');
