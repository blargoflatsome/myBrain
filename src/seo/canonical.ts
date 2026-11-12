// SPEC §8 Search listing: only the sign-in page names itself as the address to list.
import { INDEXED_PAGE } from './rules'

export function setCanonical(path: string, doc: Document = document): void {
  let link = doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (path !== INDEXED_PAGE) {
    link?.remove()
    return
  }
  if (!link) {
    link = doc.createElement('link')
    link.rel = 'canonical'
    doc.head.append(link)
  }
  link.href = `${doc.location.origin}${INDEXED_PAGE}`
}
