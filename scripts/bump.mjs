import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, relative } from 'path'
import { execSync } from 'child_process'

const ROOT_DIR = join(import.meta.dirname, '..')
const PACKAGES_DIR = join(ROOT_DIR, 'packages')
const BUMP_TYPES = ['patch', 'minor', 'major']
const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/

function fail(message) {
  console.error(`bump: ${message}`)
  process.exit(1)
}

function git(args, options = {}) {
  return execSync(`git ${args}`, { cwd: ROOT_DIR, encoding: 'utf8', ...options })
}

function assertCleanWorkingTree() {
  const status = git('status --porcelain').trim()
  if (status.length > 0) {
    fail(
      `working tree is not clean. Commit or stash these before bumping so they are not swept into the release commit:\n${status}`,
    )
  }
}

function tagExists(tag) {
  try {
    git(`rev-parse -q --verify refs/tags/${tag}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function parseVersion(version) {
  const match = SEMVER_PATTERN.exec(version)
  if (match === null) {
    fail(
      `current version '${version}' is not a plain x.y.z semver. Prerelease and build-metadata versions are not supported.`,
    )
  }
  const [major, minor, patch] = match.slice(1).map(Number)
  if (![major, minor, patch].every(Number.isSafeInteger)) {
    fail(`current version '${version}' has non-numeric components`)
  }
  return { major, minor, patch }
}

function bumpVersion(version, type) {
  const { major, minor, patch } = parseVersion(version)
  if (type === 'major') return `${major + 1}.0.0`
  if (type === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

function readManifest(dir) {
  const path = join(PACKAGES_DIR, dir, 'package.json')
  return { path, pkg: JSON.parse(readFileSync(path, 'utf8')) }
}

const bumpType = process.argv[2]

if (!BUMP_TYPES.includes(bumpType)) {
  fail(`Usage: node scripts/bump.mjs <${BUMP_TYPES.join('|')}>`)
}

assertCleanWorkingTree()

const dirs = readdirSync(PACKAGES_DIR, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)

if (dirs.length === 0) {
  fail(`no packages found in ${PACKAGES_DIR}`)
}

const manifests = dirs.map(readManifest)
const currentVersion = manifests[0].pkg.version
const drifted = manifests.filter(({ pkg }) => pkg.version !== currentVersion)

if (drifted.length > 0) {
  const detail = drifted.map(({ pkg }) => `  ${pkg.name}@${pkg.version}`).join('\n')
  fail(`packages disagree on the current version (expected ${currentVersion}):\n${detail}`)
}

const nextVersion = bumpVersion(currentVersion, bumpType)
const nextTag = `v${nextVersion}`

if (tagExists(nextTag)) {
  fail(`tag ${nextTag} already exists. Delete it or choose a different bump type.`)
}

console.log(`${currentVersion} → ${nextVersion} (${bumpType})\n`)

const stagedPaths = []

for (const { path, pkg } of manifests) {
  writeFileSync(path, JSON.stringify({ ...pkg, version: nextVersion }, null, 2) + '\n')
  stagedPaths.push(relative(ROOT_DIR, path).split('\\').join('/'))
  console.log(`  ${pkg.name}@${nextVersion}`)
}

git(`add ${stagedPaths.map(path => `"${path}"`).join(' ')}`, { stdio: 'inherit' })
git(`commit -m "release: ${nextTag}"`, { stdio: 'inherit' })
git(`tag -a ${nextTag} -m "${nextTag}"`, { stdio: 'inherit' })

console.log(`\nTagged ${nextTag}. Push with: git push --follow-tags`)
