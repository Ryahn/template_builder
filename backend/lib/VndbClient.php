<?php
declare(strict_types=1);

require_once __DIR__ . '/Response.php'; // same directory

final class VndbClient
{
    private const BASE = 'https://api.vndb.org/kana';

    public function __construct(
        private readonly string $token
    ) {}

    /** @return array<string,mixed> */
    public function post(string $endpoint, array $body): array
    {
        $url = self::BASE . $endpoint;
        $json = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            json_err(500, 'JSON encode failed');
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Token ' . $this->token,
            ],
            CURLOPT_POSTFIELDS => $json,
            CURLOPT_TIMEOUT => 25,
        ]);
        $raw = curl_exec($ch);
        $errno = curl_errno($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno !== 0) {
            json_err(502, 'VNDB request failed: ' . curl_strerror($errno));
        }

        $decoded = $raw !== false && $raw !== '' ? json_decode($raw, true) : null;
        if ($code >= 400) {
            $msg = is_array($decoded) && isset($decoded['message']) ? (string) $decoded['message'] : 'VNDB error';
            json_err($code === 401 ? 502 : 502, 'VNDB: ' . $msg, ['vndb_status' => $code]);
        }

        return is_array($decoded) ? $decoded : [];
    }

    /** @return array<string,mixed>|null */
    public function lookupVn(?string $id, ?string $search): ?array
    {
        if ($id !== null && $id !== '') {
            $idNorm = strtolower($id);
            if (!str_starts_with($idNorm, 'v')) {
                $idNorm = 'v' . preg_replace('/\D/', '', $idNorm);
            }
            $filters = ['id', '=', $idNorm];
        } elseif ($search !== null && $search !== '') {
            $filters = ['search', '=', $search];
        } else {
            return null;
        }

        $fields = 'id, title, alttitle, aliases, released, length_minutes, developers.name, tags.name, languages';
        $res = $this->post('/vn', [
            'filters' => $filters,
            'fields' => $fields,
            'results' => 5,
        ]);

        $results = $res['results'] ?? null;
        if (!is_array($results) || $results === []) {
            return null;
        }

        $vn = $results[0];
        return $this->mapVn($vn);
    }

    /** @param array<string,mixed> $vn */
    private function mapVn(array $vn): array
    {
        $developers = [];
        if (isset($vn['developers']) && is_array($vn['developers'])) {
            foreach ($vn['developers'] as $d) {
                if (is_array($d) && isset($d['name'])) {
                    $developers[] = ['name' => (string) $d['name']];
                }
            }
        }

        $tags = [];
        if (isset($vn['tags']) && is_array($vn['tags'])) {
            foreach ($vn['tags'] as $t) {
                if (is_array($t) && isset($t['name'])) {
                    $tags[] = (string) $t['name'];
                }
            }
        }

        $languages = [];
        if (isset($vn['languages']) && is_array($vn['languages'])) {
            $languages = array_map('strval', $vn['languages']);
        }

        return [
            'id' => isset($vn['id']) ? (string) $vn['id'] : '',
            'title' => isset($vn['title']) ? (string) $vn['title'] : '',
            'alttitle' => isset($vn['alttitle']) ? $vn['alttitle'] : null,
            'aliases' => isset($vn['aliases']) && is_array($vn['aliases']) ? array_map('strval', $vn['aliases']) : [],
            'released' => isset($vn['released']) ? $vn['released'] : null,
            'length_minutes' => isset($vn['length_minutes']) ? $vn['length_minutes'] : null,
            'developers' => $developers,
            'tags' => $tags,
            'languages' => $languages,
        ];
    }
}
