// Prints the resolved base URL, so the shell can exercise it under different
// environments. See the "site url" case table in the commit that added it.
import { siteConfig } from '../src/config/site'
function main() {
  let valid = true
  try { new URL(siteConfig.url) } catch { valid = false }
  console.log(`${siteConfig.url}\t${valid ? 'valid' : 'INVALID-URL'}`)
}
main()
