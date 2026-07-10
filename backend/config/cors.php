<?php

return [
    'paths' => ['api/*'],
    'allowed_methods' => ['*'],

    // Dev: allow everything so a tablet on the shop's Wi-Fi can reach the API
    // from whatever LAN IP it has. For production, replace '*' with your
    // exact frontend origin(s), e.g. ['https://pos.myshop.com'].
    'allowed_origins' => ['*'],

    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => false,
];
