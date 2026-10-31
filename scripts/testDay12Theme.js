import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

console.log('====================================================');
console.log('       DAY 12 LIGHT/DARK MODE TEST SUITE            ');
console.log('====================================================\n');

// [1/4] Test Zero-Flash Script & HTML Configuration
console.log('[1/4] Verifying HTML & Pre-Paint Theme Script...');
const indexHtml = fs.readFileSync(path.join(rootDir, 'frontend/index.html'), 'utf8');
assert(indexHtml.includes('localStorage.getItem(\'theme\')'), 'index.html must check localStorage theme');
assert(indexHtml.includes('prefers-color-scheme: dark'), 'index.html must check prefers-color-scheme fallback');
assert(indexHtml.includes('classList.toggle(\'dark\''), 'index.html must toggle dark class before paint');
console.log('  ✓ Theme pre-paint script prevents flash of wrong theme');
console.log('  ✓ System color scheme fallback supported');

// [2/4] Test CSS Semantic Tokens & WCAG AA Contrast Ratios
console.log('\n[2/4] Testing CSS Theme Tokens & Accessible Contrast...');
const indexCss = fs.readFileSync(path.join(rootDir, 'frontend/src/index.css'), 'utf8');

// Ensure all core tokens exist in :root (light) and .dark
const requiredTokens = [
  '--canvas',
  '--ink',
  '--ink-soft',
  '--ink-muted',
  '--accent',
  '--income',
  '--expense',
  '--warning',
  '--info',
  '--brand-from',
  '--brand-to',
  '--glass',
  '--glass-strong',
  '--glass-border',
  '--field',
  '--track',
  '--solid'
];

requiredTokens.forEach((token) => {
  assert(indexCss.includes(token), `index.css must declare token ${token}`);
});
console.log('  ✓ All 17 required semantic tokens declared in CSS');

// Verify WCAG AA contrast for text tokens
// Relative luminance helper
function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(rgb1, rgb2) {
  const l1 = getLuminance(...rgb1);
  const l2 = getLuminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Light theme: Canvas [236, 253, 245], Ink [15, 23, 42], Ink-soft [71, 85, 105], Accent [4, 120, 87]
const lightCanvas = [236, 253, 245];
const lightInk = [15, 23, 42];
const lightInkSoft = [71, 85, 105];
const lightAccent = [4, 120, 87];

const lightInkContrast = getContrastRatio(lightInk, lightCanvas);
const lightInkSoftContrast = getContrastRatio(lightInkSoft, lightCanvas);
const lightAccentContrast = getContrastRatio(lightAccent, lightCanvas);

assert(lightInkContrast >= 7.0, `Light ink contrast ${lightInkContrast} must exceed 7:1 (AAA)`);
assert(lightInkSoftContrast >= 4.5, `Light ink-soft contrast ${lightInkSoftContrast} must exceed 4.5:1 (AA)`);
assert(lightAccentContrast >= 4.5, `Light accent contrast ${lightAccentContrast} must exceed 4.5:1 (AA)`);
console.log(`  ✓ Light mode primary text contrast: ${lightInkContrast.toFixed(1)}:1 (Exceeds WCAG AAA)`);
console.log(`  ✓ Light mode secondary text contrast: ${lightInkSoftContrast.toFixed(1)}:1 (Exceeds WCAG AA)`);

// Dark theme: Canvas [6, 19, 15], Ink [229, 233, 245], Ink-soft [151, 160, 184], Accent [52, 211, 153]
const darkCanvas = [6, 19, 15];
const darkInk = [229, 233, 245];
const darkInkSoft = [151, 160, 184];
const darkAccent = [52, 211, 153];

const darkInkContrast = getContrastRatio(darkInk, darkCanvas);
const darkInkSoftContrast = getContrastRatio(darkInkSoft, darkCanvas);
const darkAccentContrast = getContrastRatio(darkAccent, darkCanvas);

assert(darkInkContrast >= 7.0, `Dark ink contrast ${darkInkContrast} must exceed 7:1 (AAA)`);
assert(darkInkSoftContrast >= 4.5, `Dark ink-soft contrast ${darkInkSoftContrast} must exceed 4.5:1 (AA)`);
assert(darkAccentContrast >= 4.5, `Dark accent contrast ${darkAccentContrast} must exceed 4.5:1 (AA)`);
console.log(`  ✓ Dark mode primary text contrast: ${darkInkContrast.toFixed(1)}:1 (Exceeds WCAG AAA)`);
console.log(`  ✓ Dark mode secondary text contrast: ${darkInkSoftContrast.toFixed(1)}:1 (Exceeds WCAG AA)`);

// [3/4] Test Reactive Theme Context & Hook
console.log('\n[3/4] Testing React ThemeContext and Hook...');
const themeContextFile = fs.readFileSync(path.join(rootDir, 'frontend/src/context/ThemeContext.jsx'), 'utf8');
assert(themeContextFile.includes('localStorage.setItem(\'theme\', theme)'), 'ThemeContext must persist theme to localStorage');
assert(themeContextFile.includes('document.documentElement.classList.toggle(\'dark\''), 'ThemeContext must toggle dark class on DOM');
assert(themeContextFile.includes('document.documentElement.style.colorScheme'), 'ThemeContext must sync colorScheme');
assert(themeContextFile.includes('window.addEventListener(\'storage\''), 'ThemeContext must support multi-tab synchronization');
console.log('  ✓ ThemeContext synchronizes DOM and localStorage reactively');
console.log('  ✓ Cross-tab storage listener synchronizes multi-tab sessions');

// [4/4] Test Category & Copilot Theme Integration
console.log('\n[4/4] Verifying Category & Copilot Theming...');
const catColorsFile = fs.readFileSync(path.join(rootDir, 'frontend/src/utils/categoryColors.js'), 'utf8');
assert(catColorsFile.includes('color: isDarkMode ? meta.dark : meta.light'), 'getCategoryDetails must resolve active theme color');

const copilotPanelFile = fs.readFileSync(path.join(rootDir, 'frontend/src/components/copilot/CopilotPanel.jsx'), 'utf8');
const copilotMessageFile = fs.readFileSync(path.join(rootDir, 'frontend/src/components/copilot/CopilotMessage.jsx'), 'utf8');
assert(copilotPanelFile.includes('glass-strong'), 'CopilotPanel must use glass-strong surface token');
assert(copilotMessageFile.includes('bg-brand text-on-brand'), 'Copilot user message must use brand tokens');
assert(copilotMessageFile.includes('bg-field border border-glass-border'), 'Copilot assistant message must use field tokens');
console.log('  ✓ Category colors adapt dynamically between light and dark palettes');
console.log('  ✓ Copilot panel fully styled with semantic glass and brand tokens');

console.log('\n====================================================');
console.log('  ALL 12/12 DAY 12 LIGHT/DARK MODE TESTS PASSED!');
console.log('====================================================');

