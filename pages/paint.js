const COLORS = {
  'Solid White': 0xFFFFFF,
  'Black': 0x333333,
  'Metallic Brown': 0xAC4313,
  'Obsidian Black': 0x2E293A,
  'Metallic Blue': 0x32527B,
  'Steel Grey': 0x71797E,
  'Metallic Green': 0x43464B,
  'Silver': 0xC0C0C0,
  'Metallic Dolphin Gray': 0x828e84,
  'Premium Multicoat Red': 0xFF0000,
  'Deep Blue Metallic': 0x32527B,
  'Premium Signature Red': 0xA62C2B,
  'Pearl White': 0xF8F6F0,
  'Titanium': 0x878681,
}

export const getColor = (exterior_color) => {
  return COLORS[exterior_color] || 0x333333
}
