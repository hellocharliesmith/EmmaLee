// Auto-generated names for new songs: an uncommon color + a Seattle-area
// scenic/water site (favoring Native American place names, e.g. Salish Sea,
// Duwamish, Snoqualmie). Green is deliberately excluded — too obvious.

const COLORS = [
  'violet', 'amber', 'cobalt', 'ochre', 'slate', 'indigo', 'crimson',
  'umber', 'saffron', 'periwinkle', 'mauve', 'vermilion', 'cerulean',
  'magenta', 'coral', 'rust', 'plum', 'charcoal', 'ivory', 'garnet',
  'marigold', 'lilac', 'scarlet', 'tangerine', 'cinnamon', 'obsidian',
  'pewter', 'rosewood', 'chestnut', 'sienna',
];

const SITES = [
  'salish_sea', 'duwamish', 'suquamish', 'snoqualmie', 'snohomish',
  'tulalip', 'muckleshoot', 'puyallup', 'sammamish', 'stillaguamish',
  'skykomish', 'nisqually', 'skagit_bay', 'elliott_bay', 'alki_beach',
  'golden_gardens', 'discovery_park', 'shilshole_bay', 'lake_union',
  'puget_sound', 'ballard_locks', 'carkeek_park', 'madrona',
  'matthews_beach', 'seward_park', 'dash_point', 'point_defiance',
  'owen_beach', 'hood_canal', 'fauntleroy',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateSongName(): string {
  return `${pick(COLORS)}_${pick(SITES)}`;
}
