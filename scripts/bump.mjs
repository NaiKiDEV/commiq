import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

const PACKAGES_DIR = join(import.meta.dirname, '..', 'packages')
const BUMP_TYPES = ['patch', 'minor', 'major']

const bumpType = process.argv[2]

if (!BUMP_TYPES.includes(bumpType)) {
  console.error(`Usage: node scripts/bump.mjs <${BUMP_TYPES.join('|')}>`)
  process.exit(1)
}

function bumpVersion(version, type) {
  const [major, minor, patch] = version.split('.').map(Number)
  if (type === 'major') return `${major + 1}.0.0`
  if (type === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

const dirs = readdirSync(PACKAGES_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)

const pkgJsonPath = dir => join(PACKAGES_DIR, dir, 'package.json')
const first = JSON.parse(readFileSync(pkgJsonPath(dirs[0]), 'utf8'))
const currentVersion = first.version
const nextVersion = bumpVersion(currentVersion, bumpType)

console.log(`${currentVersion} → ${nextVersion} (${bumpType})\n`)

for (const dir of dirs) {
  const path = pkgJsonPath(dir)
  const pkg = JSON.parse(readFileSync(path, 'utf8'))
  pkg.version = nextVersion
  writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`  ${pkg.name}@${nextVersion}`)
}

execSync(`git add -A`, { stdio: 'inherit' })
execSync(`git commit -m "release: v${nextVersion}"`, { stdio: 'inherit' })
execSync(`git tag v${nextVersion}`, { stdio: 'inherit' })

console.log(`\nTagged v${nextVersion}. Push with: git push --follow-tags`)
