<?php
declare(strict_types=1);

function json_response(int $code, array $data): never
{
    header('Content-Type: application/json; charset=utf-8');
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function json_ok(array $data): never
{
    json_response(200, $data);
}

function json_err(int $code, string $message, ?array $extra = null): never
{
    $b = ['error' => $message];
    if ($extra) {
        $b = array_merge($b, $extra);
    }
    json_response($code, $b);
}
