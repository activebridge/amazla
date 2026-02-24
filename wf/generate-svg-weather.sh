#!/bin/bash

SVG_DIR="/Users/galulex/amazla/wf/assets/480x480-amazfit-balance/weather/svg"
mkdir -p "$SVG_DIR"

# Sunny - light blue bg, yellow sun with rays
cat > "$SVG_DIR/sunny.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#4FC3F7"/>
  <g transform="translate(240,220)">
    <!-- Sun rays -->
    <g stroke="#FDD835" stroke-width="8" stroke-linecap="round">
      <line x1="0" y1="-120" x2="0" y2="-150"/>
      <line x1="0" y1="120" x2="0" y2="150"/>
      <line x1="-120" y1="0" x2="-150" y2="0"/>
      <line x1="120" y1="0" x2="150" y2="0"/>
      <line x1="-85" y1="-85" x2="-106" y2="-106"/>
      <line x1="85" y1="-85" x2="106" y2="-106"/>
      <line x1="-85" y1="85" x2="-106" y2="106"/>
      <line x1="85" y1="85" x2="106" y2="106"/>
    </g>
    <!-- Sun circle -->
    <circle cx="0" cy="0" r="80" fill="#FDD835"/>
  </g>
</svg>
EOF

# Cloudy - blue bg, sun behind white cloud
cat > "$SVG_DIR/cloudy.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#5C9CE5"/>
  <g transform="translate(240,200)">
    <!-- Sun peeking -->
    <circle cx="50" cy="-30" r="60" fill="#FDD835"/>
    <!-- Cloud -->
    <g fill="#FFFFFF">
      <ellipse cx="-60" cy="30" rx="55" ry="45"/>
      <ellipse cx="0" cy="10" rx="70" ry="55"/>
      <ellipse cx="70" cy="30" rx="50" ry="40"/>
      <ellipse cx="0" cy="50" rx="100" ry="40"/>
    </g>
  </g>
</svg>
EOF

# Overcast - gray bg, dark clouds
cat > "$SVG_DIR/overcast.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#78909C"/>
  <g transform="translate(240,200)">
    <g fill="#ECEFF1">
      <ellipse cx="-70" cy="20" rx="60" ry="50"/>
      <ellipse cx="0" cy="0" rx="80" ry="60"/>
      <ellipse cx="80" cy="25" rx="55" ry="45"/>
      <ellipse cx="0" cy="50" rx="110" ry="45"/>
    </g>
  </g>
</svg>
EOF

# Showers / Light rain - blue bg, cloud with rain drops
cat > "$SVG_DIR/showers.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#5C9CE5"/>
  <g transform="translate(240,180)">
    <!-- Cloud -->
    <g fill="#ECEFF1">
      <ellipse cx="-50" cy="20" rx="50" ry="40"/>
      <ellipse cx="10" cy="0" rx="65" ry="50"/>
      <ellipse cx="70" cy="25" rx="45" ry="35"/>
      <ellipse cx="10" cy="45" rx="90" ry="35"/>
    </g>
    <!-- Rain drops -->
    <g fill="#4FC3F7">
      <ellipse cx="-40" cy="120" rx="6" ry="15"/>
      <ellipse cx="10" cy="140" rx="6" ry="15"/>
      <ellipse cx="60" cy="115" rx="6" ry="15"/>
      <ellipse cx="-10" cy="170" rx="6" ry="15"/>
      <ellipse cx="40" cy="185" rx="6" ry="15"/>
    </g>
  </g>
</svg>
EOF

# Copy showers to light_rain
cat > "$SVG_DIR/light_rain.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#5C9CE5"/>
  <g transform="translate(240,180)">
    <g fill="#ECEFF1">
      <ellipse cx="-50" cy="20" rx="50" ry="40"/>
      <ellipse cx="10" cy="0" rx="65" ry="50"/>
      <ellipse cx="70" cy="25" rx="45" ry="35"/>
      <ellipse cx="10" cy="45" rx="90" ry="35"/>
    </g>
    <g fill="#4FC3F7">
      <ellipse cx="-30" cy="120" rx="5" ry="12"/>
      <ellipse cx="20" cy="135" rx="5" ry="12"/>
      <ellipse cx="50" cy="120" rx="5" ry="12"/>
    </g>
  </g>
</svg>
EOF

# Moderate rain
cat > "$SVG_DIR/moderate_rain.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#4A90C2"/>
  <g transform="translate(240,170)">
    <g fill="#B0BEC5">
      <ellipse cx="-55" cy="20" rx="55" ry="45"/>
      <ellipse cx="10" cy="0" rx="70" ry="55"/>
      <ellipse cx="75" cy="25" rx="50" ry="40"/>
      <ellipse cx="10" cy="50" rx="100" ry="40"/>
    </g>
    <g fill="#64B5F6">
      <ellipse cx="-50" cy="120" rx="6" ry="18"/>
      <ellipse cx="-10" cy="145" rx="6" ry="18"/>
      <ellipse cx="30" cy="125" rx="6" ry="18"/>
      <ellipse cx="70" cy="150" rx="6" ry="18"/>
      <ellipse cx="-30" cy="180" rx="6" ry="18"/>
      <ellipse cx="50" cy="190" rx="6" ry="18"/>
    </g>
  </g>
</svg>
EOF

# Heavy rain
cat > "$SVG_DIR/heavy_rain.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#37474F"/>
  <g transform="translate(240,160)">
    <g fill="#78909C">
      <ellipse cx="-60" cy="20" rx="60" ry="50"/>
      <ellipse cx="10" cy="0" rx="75" ry="60"/>
      <ellipse cx="80" cy="25" rx="55" ry="45"/>
      <ellipse cx="10" cy="55" rx="110" ry="45"/>
    </g>
    <g fill="#42A5F5">
      <ellipse cx="-60" cy="130" rx="7" ry="22"/>
      <ellipse cx="-20" cy="155" rx="7" ry="22"/>
      <ellipse cx="20" cy="135" rx="7" ry="22"/>
      <ellipse cx="60" cy="160" rx="7" ry="22"/>
      <ellipse cx="-40" cy="200" rx="7" ry="22"/>
      <ellipse cx="0" cy="220" rx="7" ry="22"/>
      <ellipse cx="40" cy="205" rx="7" ry="22"/>
      <ellipse cx="80" cy="225" rx="7" ry="22"/>
    </g>
  </g>
</svg>
EOF

# Thunderstorm - purple bg, dark cloud with lightning
cat > "$SVG_DIR/tstorms.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#6A1B9A"/>
  <g transform="translate(240,160)">
    <!-- Dark cloud -->
    <g fill="#37474F">
      <ellipse cx="-60" cy="15" rx="55" ry="45"/>
      <ellipse cx="5" cy="0" rx="70" ry="55"/>
      <ellipse cx="70" cy="20" rx="50" ry="40"/>
      <ellipse cx="5" cy="45" rx="100" ry="40"/>
    </g>
    <!-- Lightning bolt -->
    <polygon points="20,80 -10,150 15,150 -20,230 50,130 20,130 50,80" fill="#FFD54F"/>
    <!-- Rain -->
    <g fill="#7E57C2" opacity="0.8">
      <ellipse cx="-50" cy="150" rx="5" ry="15"/>
      <ellipse cx="80" cy="140" rx="5" ry="15"/>
      <ellipse cx="-30" cy="200" rx="5" ry="15"/>
      <ellipse cx="60" cy="210" rx="5" ry="15"/>
    </g>
  </g>
</svg>
EOF

# Snow showers
cat > "$SVG_DIR/snow_showers.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#81D4FA"/>
  <g transform="translate(240,180)">
    <g fill="#FFFFFF">
      <ellipse cx="-50" cy="20" rx="50" ry="40"/>
      <ellipse cx="10" cy="0" rx="65" ry="50"/>
      <ellipse cx="70" cy="25" rx="45" ry="35"/>
      <ellipse cx="10" cy="45" rx="90" ry="35"/>
    </g>
    <!-- Snowflakes -->
    <g fill="#FFFFFF" opacity="0.9">
      <circle cx="-40" cy="110" r="8"/>
      <circle cx="10" cy="130" r="10"/>
      <circle cx="60" cy="115" r="7"/>
      <circle cx="-20" cy="165" r="9"/>
      <circle cx="40" cy="180" r="8"/>
    </g>
  </g>
</svg>
EOF

# Light snow
cat > "$SVG_DIR/light_snow.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#B3E5FC"/>
  <g transform="translate(240,180)">
    <g fill="#FFFFFF">
      <ellipse cx="-50" cy="20" rx="50" ry="40"/>
      <ellipse cx="10" cy="0" rx="65" ry="50"/>
      <ellipse cx="70" cy="25" rx="45" ry="35"/>
      <ellipse cx="10" cy="45" rx="90" ry="35"/>
    </g>
    <g fill="#FFFFFF">
      <circle cx="-30" cy="115" r="6"/>
      <circle cx="20" cy="130" r="7"/>
      <circle cx="50" cy="115" r="6"/>
    </g>
  </g>
</svg>
EOF

# Moderate snow
cat > "$SVG_DIR/moderate_snow.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#81D4FA"/>
  <g transform="translate(240,170)">
    <g fill="#ECEFF1">
      <ellipse cx="-55" cy="20" rx="55" ry="45"/>
      <ellipse cx="10" cy="0" rx="70" ry="55"/>
      <ellipse cx="75" cy="25" rx="50" ry="40"/>
      <ellipse cx="10" cy="50" rx="100" ry="40"/>
    </g>
    <g fill="#FFFFFF">
      <circle cx="-50" cy="120" r="8"/>
      <circle cx="-10" cy="145" r="9"/>
      <circle cx="30" cy="125" r="7"/>
      <circle cx="70" cy="150" r="8"/>
      <circle cx="-30" cy="180" r="9"/>
      <circle cx="50" cy="190" r="8"/>
    </g>
  </g>
</svg>
EOF

# Heavy snow
cat > "$SVG_DIR/heavy_snow.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#78909C"/>
  <g transform="translate(240,160)">
    <g fill="#B0BEC5">
      <ellipse cx="-60" cy="20" rx="60" ry="50"/>
      <ellipse cx="10" cy="0" rx="75" ry="60"/>
      <ellipse cx="80" cy="25" rx="55" ry="45"/>
      <ellipse cx="10" cy="55" rx="110" ry="45"/>
    </g>
    <g fill="#FFFFFF">
      <circle cx="-60" cy="130" r="10"/>
      <circle cx="-20" cy="155" r="11"/>
      <circle cx="20" cy="135" r="9"/>
      <circle cx="60" cy="160" r="10"/>
      <circle cx="-40" cy="195" r="11"/>
      <circle cx="0" cy="215" r="10"/>
      <circle cx="40" cy="200" r="9"/>
      <circle cx="80" cy="220" r="10"/>
    </g>
  </g>
</svg>
EOF

# Fog - light blue bg with wavy lines
cat > "$SVG_DIR/fog.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#81D4FA"/>
  <g stroke="#FFFFFF" stroke-width="12" stroke-linecap="round" fill="none">
    <path d="M80,180 Q160,160 240,180 Q320,200 400,180"/>
    <path d="M80,240 Q160,220 240,240 Q320,260 400,240"/>
    <path d="M80,300 Q160,280 240,300 Q320,320 400,300"/>
  </g>
</svg>
EOF

# Hazy
cat > "$SVG_DIR/hazy.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#BCAAA4"/>
  <!-- Dim sun -->
  <circle cx="240" cy="180" r="60" fill="#FFE082" opacity="0.6"/>
  <g stroke="#D7CCC8" stroke-width="10" stroke-linecap="round" fill="none">
    <path d="M80,280 Q160,260 240,280 Q320,300 400,280"/>
    <path d="M80,340 Q160,320 240,340 Q320,360 400,340"/>
  </g>
</svg>
EOF

# Sandstorm
cat > "$SVG_DIR/sandstorm.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#A1887F"/>
  <g stroke="#D7CCC8" stroke-width="14" stroke-linecap="round" fill="none" opacity="0.8">
    <path d="M60,160 Q180,130 300,160 Q420,190 480,160"/>
    <path d="M0,240 Q120,210 240,240 Q360,270 480,240"/>
    <path d="M60,320 Q180,290 300,320 Q420,350 480,320"/>
  </g>
</svg>
EOF

# Rain and snow
cat > "$SVG_DIR/rain_snow.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#78909C"/>
  <g transform="translate(240,170)">
    <g fill="#B0BEC5">
      <ellipse cx="-55" cy="20" rx="55" ry="45"/>
      <ellipse cx="10" cy="0" rx="70" ry="55"/>
      <ellipse cx="75" cy="25" rx="50" ry="40"/>
      <ellipse cx="10" cy="50" rx="100" ry="40"/>
    </g>
    <!-- Rain -->
    <g fill="#64B5F6">
      <ellipse cx="-50" cy="130" rx="5" ry="15"/>
      <ellipse cx="10" cy="145" rx="5" ry="15"/>
      <ellipse cx="70" cy="135" rx="5" ry="15"/>
    </g>
    <!-- Snow -->
    <g fill="#FFFFFF">
      <circle cx="-20" cy="120" r="7"/>
      <circle cx="40" cy="170" r="8"/>
      <circle cx="-40" cy="190" r="7"/>
    </g>
  </g>
</svg>
EOF

# Snowstorm
cat > "$SVG_DIR/snowstorm.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#607D8B"/>
  <g transform="translate(240,150)">
    <g fill="#78909C">
      <ellipse cx="-65" cy="20" rx="65" ry="55"/>
      <ellipse cx="10" cy="0" rx="80" ry="65"/>
      <ellipse cx="85" cy="25" rx="60" ry="50"/>
      <ellipse cx="10" cy="60" rx="120" ry="50"/>
    </g>
    <g fill="#FFFFFF">
      <circle cx="-70" cy="140" r="11"/>
      <circle cx="-30" cy="165" r="12"/>
      <circle cx="10" cy="145" r="10"/>
      <circle cx="50" cy="170" r="11"/>
      <circle cx="90" cy="150" r="12"/>
      <circle cx="-50" cy="210" r="12"/>
      <circle cx="-10" cy="230" r="11"/>
      <circle cx="30" cy="215" r="10"/>
      <circle cx="70" cy="240" r="12"/>
    </g>
  </g>
</svg>
EOF

# Floating dust
cat > "$SVG_DIR/floating_dust.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#BCAAA4"/>
  <g fill="#8D6E63" opacity="0.5">
    <circle cx="80" cy="120" r="4"/><circle cx="160" cy="100" r="3"/>
    <circle cx="240" cy="140" r="5"/><circle cx="320" cy="110" r="3"/>
    <circle cx="400" cy="130" r="4"/><circle cx="120" cy="200" r="3"/>
    <circle cx="200" cy="220" r="4"/><circle cx="280" cy="190" r="5"/>
    <circle cx="360" cy="210" r="3"/><circle cx="100" cy="300" r="4"/>
    <circle cx="180" cy="320" r="3"/><circle cx="260" cy="290" r="5"/>
    <circle cx="340" cy="310" r="4"/><circle cx="420" cy="280" r="3"/>
    <circle cx="140" cy="400" r="4"/><circle cx="220" cy="380" r="3"/>
    <circle cx="300" cy="410" r="5"/><circle cx="380" cy="390" r="4"/>
  </g>
</svg>
EOF

# Very heavy rainstorm
cat > "$SVG_DIR/very_heavy_rainstorm.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#1A237E"/>
  <g transform="translate(240,140)">
    <g fill="#37474F">
      <ellipse cx="-70" cy="20" rx="70" ry="55"/>
      <ellipse cx="10" cy="0" rx="85" ry="70"/>
      <ellipse cx="90" cy="25" rx="60" ry="50"/>
      <ellipse cx="10" cy="65" rx="130" ry="55"/>
    </g>
    <g fill="#1565C0">
      <ellipse cx="-70" cy="150" rx="8" ry="28"/>
      <ellipse cx="-30" cy="180" rx="8" ry="28"/>
      <ellipse cx="10" cy="155" rx="8" ry="28"/>
      <ellipse cx="50" cy="185" rx="8" ry="28"/>
      <ellipse cx="90" cy="160" rx="8" ry="28"/>
      <ellipse cx="-50" cy="240" rx="8" ry="28"/>
      <ellipse cx="-10" cy="265" rx="8" ry="28"/>
      <ellipse cx="30" cy="245" rx="8" ry="28"/>
      <ellipse cx="70" cy="270" rx="8" ry="28"/>
    </g>
  </g>
</svg>
EOF

# Rain and hail
cat > "$SVG_DIR/rain_hail.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#546E7A"/>
  <g transform="translate(240,170)">
    <g fill="#78909C">
      <ellipse cx="-55" cy="20" rx="55" ry="45"/>
      <ellipse cx="10" cy="0" rx="70" ry="55"/>
      <ellipse cx="75" cy="25" rx="50" ry="40"/>
      <ellipse cx="10" cy="50" rx="100" ry="40"/>
    </g>
    <g fill="#64B5F6">
      <ellipse cx="-50" cy="130" rx="5" ry="16"/>
      <ellipse cx="10" cy="150" rx="5" ry="16"/>
      <ellipse cx="70" cy="135" rx="5" ry="16"/>
    </g>
    <g fill="#E0E0E0" stroke="#BDBDBD" stroke-width="2">
      <circle cx="-20" cy="125" r="12"/>
      <circle cx="40" cy="175" r="14"/>
      <circle cx="-40" cy="195" r="12"/>
    </g>
  </g>
</svg>
EOF

# Thunderstorms and hail
cat > "$SVG_DIR/tstorms_hail.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#4A148C"/>
  <g transform="translate(240,150)">
    <g fill="#37474F">
      <ellipse cx="-60" cy="15" rx="60" ry="50"/>
      <ellipse cx="10" cy="0" rx="75" ry="60"/>
      <ellipse cx="80" cy="20" rx="55" ry="45"/>
      <ellipse cx="10" cy="50" rx="110" ry="45"/>
    </g>
    <polygon points="10,90 -20,160 10,160 -30,240 40,140 10,140 40,90" fill="#FFD54F"/>
    <g fill="#E0E0E0" stroke="#BDBDBD" stroke-width="2">
      <circle cx="-60" cy="160" r="12"/>
      <circle cx="80" cy="150" r="14"/>
      <circle cx="-40" cy="220" r="12"/>
      <circle cx="60" cy="230" r="13"/>
    </g>
  </g>
</svg>
EOF

# Heavy rainstorm
cat > "$SVG_DIR/heavy_rainstorm.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#263238"/>
  <g transform="translate(240,150)">
    <g fill="#455A64">
      <ellipse cx="-65" cy="20" rx="65" ry="55"/>
      <ellipse cx="10" cy="0" rx="80" ry="65"/>
      <ellipse cx="85" cy="25" rx="60" ry="50"/>
      <ellipse cx="10" cy="60" rx="120" ry="50"/>
    </g>
    <g fill="#1976D2">
      <ellipse cx="-65" cy="145" rx="7" ry="25"/>
      <ellipse cx="-25" cy="175" rx="7" ry="25"/>
      <ellipse cx="15" cy="150" rx="7" ry="25"/>
      <ellipse cx="55" cy="180" rx="7" ry="25"/>
      <ellipse cx="95" cy="155" rx="7" ry="25"/>
      <ellipse cx="-45" cy="230" rx="7" ry="25"/>
      <ellipse cx="-5" cy="255" rx="7" ry="25"/>
      <ellipse cx="35" cy="235" rx="7" ry="25"/>
      <ellipse cx="75" cy="260" rx="7" ry="25"/>
    </g>
  </g>
</svg>
EOF

# Dust
cat > "$SVG_DIR/dust.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#A1887F"/>
  <g fill="#6D4C41" opacity="0.4">
    <circle cx="60" cy="100" r="5"/><circle cx="140" cy="80" r="4"/>
    <circle cx="220" cy="120" r="6"/><circle cx="300" cy="90" r="4"/>
    <circle cx="380" cy="110" r="5"/><circle cx="100" cy="180" r="4"/>
    <circle cx="180" cy="200" r="5"/><circle cx="260" cy="170" r="6"/>
    <circle cx="340" cy="190" r="4"/><circle cx="420" cy="160" r="5"/>
    <circle cx="80" cy="280" r="5"/><circle cx="160" cy="300" r="4"/>
    <circle cx="240" cy="270" r="6"/><circle cx="320" cy="290" r="5"/>
    <circle cx="400" cy="260" r="4"/><circle cx="120" cy="380" r="5"/>
    <circle cx="200" cy="360" r="4"/><circle cx="280" cy="390" r="6"/>
    <circle cx="360" cy="370" r="5"/>
  </g>
</svg>
EOF

# Heavy sandstorm
cat > "$SVG_DIR/heavy_sandstorm.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#6D4C41"/>
  <g stroke="#A1887F" stroke-width="18" stroke-linecap="round" fill="none">
    <path d="M0,140 Q120,100 240,140 Q360,180 480,140"/>
    <path d="M0,240 Q120,200 240,240 Q360,280 480,240"/>
    <path d="M0,340 Q120,300 240,340 Q360,380 480,340"/>
  </g>
</svg>
EOF

# Rainstorm
cat > "$SVG_DIR/rainstorm.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#37474F"/>
  <g transform="translate(240,160)">
    <g fill="#546E7A">
      <ellipse cx="-60" cy="20" rx="60" ry="50"/>
      <ellipse cx="10" cy="0" rx="75" ry="60"/>
      <ellipse cx="80" cy="25" rx="55" ry="45"/>
      <ellipse cx="10" cy="55" rx="110" ry="45"/>
    </g>
    <g fill="#2196F3">
      <ellipse cx="-55" cy="135" rx="6" ry="22"/>
      <ellipse cx="-15" cy="160" rx="6" ry="22"/>
      <ellipse cx="25" cy="140" rx="6" ry="22"/>
      <ellipse cx="65" cy="165" rx="6" ry="22"/>
      <ellipse cx="-35" cy="210" rx="6" ry="22"/>
      <ellipse cx="5" cy="230" rx="6" ry="22"/>
      <ellipse cx="45" cy="215" rx="6" ry="22"/>
      <ellipse cx="85" cy="240" rx="6" ry="22"/>
    </g>
  </g>
</svg>
EOF

# Unknown
cat > "$SVG_DIR/unknown.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#78909C"/>
  <text x="240" y="280" font-family="Arial, sans-serif" font-size="200" font-weight="bold" fill="#ECEFF1" text-anchor="middle">?</text>
</svg>
EOF

# Cloudy night - dark blue bg, moon behind cloud
cat > "$SVG_DIR/cloudy_night.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#1A237E"/>
  <g transform="translate(240,200)">
    <!-- Moon -->
    <circle cx="60" cy="-40" r="50" fill="#FFF9C4"/>
    <circle cx="80" cy="-50" r="45" fill="#1A237E"/>
    <!-- Cloud -->
    <g fill="#455A64">
      <ellipse cx="-60" cy="30" rx="55" ry="45"/>
      <ellipse cx="0" cy="10" rx="70" ry="55"/>
      <ellipse cx="70" cy="30" rx="50" ry="40"/>
      <ellipse cx="0" cy="50" rx="100" ry="40"/>
    </g>
  </g>
</svg>
EOF

# Showers night
cat > "$SVG_DIR/showers_night.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#1A237E"/>
  <g transform="translate(240,180)">
    <g fill="#37474F">
      <ellipse cx="-50" cy="20" rx="50" ry="40"/>
      <ellipse cx="10" cy="0" rx="65" ry="50"/>
      <ellipse cx="70" cy="25" rx="45" ry="35"/>
      <ellipse cx="10" cy="45" rx="90" ry="35"/>
    </g>
    <g fill="#5C6BC0" opacity="0.8">
      <ellipse cx="-40" cy="120" rx="5" ry="15"/>
      <ellipse cx="10" cy="140" rx="5" ry="15"/>
      <ellipse cx="60" cy="125" rx="5" ry="15"/>
      <ellipse cx="-10" cy="175" rx="5" ry="15"/>
      <ellipse cx="40" cy="185" rx="5" ry="15"/>
    </g>
  </g>
</svg>
EOF

# Clear night - dark blue with moon and stars
cat > "$SVG_DIR/sunny_night.svg" << 'EOF'
<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="480" fill="#1A237E"/>
  <!-- Stars -->
  <g fill="#FFFFFF">
    <circle cx="80" cy="100" r="2"/><circle cx="140" cy="60" r="1.5"/>
    <circle cx="400" cy="80" r="2.5"/><circle cx="360" cy="140" r="2"/>
    <circle cx="60" cy="200" r="2"/><circle cx="420" cy="220" r="1.5"/>
    <circle cx="100" cy="350" r="2"/><circle cx="380" cy="380" r="2"/>
    <circle cx="160" cy="420" r="1.5"/><circle cx="320" cy="440" r="2"/>
  </g>
  <!-- Moon -->
  <g transform="translate(240,200)">
    <circle cx="0" cy="0" r="70" fill="#FFF9C4"/>
    <circle cx="25" cy="-15" r="65" fill="#1A237E"/>
  </g>
</svg>
EOF

echo "All 29 flat UI weather SVGs created!"
