import { expect, test } from '@playwright/test'

test('acknowledges Carnegie Mellon University and serves the dictionary licence', async ({
  page,
}) => {
  await page.goto('/')

  const howItWorks = page.getByRole('region', { name: 'How it works' })
  await expect(howItWorks).toContainText(
    'The app uses the CMU Pronouncing Dictionary of Carnegie Mellon University (licence).',
  )
  const licence = await page.request.get(
    (await howItWorks.getByRole('link', { name: 'licence' }).getAttribute('href')) ?? '',
  )
  expect(licence.ok()).toBe(true)
  expect(await licence.text()).toContain('Carnegie Mellon University')
})

test('does not request the dictionary on the first load of the app', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'No songs yet' })).toBeVisible()

  expect(requests.filter((url) => url.includes('cmudict'))).toEqual([])
})

test('serves dict/cmudict.json with the entry for HELLO', async ({ request }) => {
  const response = await request.get('/dict/cmudict.json')

  expect(response.ok()).toBe(true)
  expect((await response.json()) as Record<string, string>).toMatchObject({
    HELLO: 'HH AH0 L OW1',
  })
})
