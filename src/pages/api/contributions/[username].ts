import type { APIRoute } from 'astro';

export const prerender = false;

const CACHE_TTL_MS = 5 * 60 * 1000;
const STALE_IF_ERROR_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const GITHUB_USERNAME_REGEX = /^(?!-)[A-Za-z0-9-]{1,39}(?<!-)$/;

type CacheEntry = {
	data: unknown;
	expiresAt: number;
	staleUntil: number;
};

type UpstreamError = {
	kind: 'upstream';
	status: number;
	message: string;
};

const contributionCache = new Map<string, CacheEntry>();

const defaultResponseHeaders = {
	'Content-Type': 'application/json; charset=utf-8',
	'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=60',
};

function createJsonResponse(body: unknown, status: number, extraHeaders?: Record<string, string>): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			...defaultResponseHeaders,
			...(extraHeaders ?? {}),
		},
	});
}

function isValidGitHubUsername(value: string): boolean {
	return GITHUB_USERNAME_REGEX.test(value);
}

async function fetchContributions(username: string): Promise<unknown> {
	const upstreamUrl = `https://github.com/${encodeURIComponent(username)}.contribs`;
	const upstreamResponse = await fetch(upstreamUrl, {
		headers: {
			Accept: 'application/json, text/plain;q=0.9, */*;q=0.1',
			'User-Agent': 'mona-mayhem/0.0.1',
		},
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});

	if (!upstreamResponse.ok) {
		throw {
			kind: 'upstream',
			status: upstreamResponse.status,
			message: `GitHub upstream request failed with status ${upstreamResponse.status}`,
		} satisfies UpstreamError;
	}

	const upstreamText = await upstreamResponse.text();

	try {
		return JSON.parse(upstreamText);
	} catch {
		throw {
			kind: 'upstream',
			status: 502,
			message: 'GitHub upstream returned invalid JSON.',
		} satisfies UpstreamError;
	}
}

function isUpstreamError(error: unknown): error is UpstreamError {
	if (!error || typeof error !== 'object') {
		return false;
	}

	return 'kind' in error && error.kind === 'upstream' && 'status' in error && 'message' in error;
}

export const GET: APIRoute = async ({ params }) => {
	const username = (params.username ?? '').trim();

	if (!isValidGitHubUsername(username)) {
		return createJsonResponse(
			{
				error: 'Invalid GitHub username. Use 1-39 letters, numbers, or hyphens (no leading/trailing hyphen).',
			},
			400
		);
	}

	const now = Date.now();
	const cached = contributionCache.get(username);

	if (cached && cached.expiresAt > now) {
		return createJsonResponse(cached.data, 200, { 'X-Cache': 'HIT' });
	}

	try {
		const data = await fetchContributions(username);
		contributionCache.set(username, {
			data,
			expiresAt: now + CACHE_TTL_MS,
			staleUntil: now + CACHE_TTL_MS + STALE_IF_ERROR_MS,
		});

		return createJsonResponse(data, 200, { 'X-Cache': 'MISS' });
	} catch (error: unknown) {
		const staleCacheIsUsable = cached && cached.staleUntil > now;
		if (staleCacheIsUsable) {
			return createJsonResponse(cached.data, 200, {
				'X-Cache': 'STALE',
				Warning: '110 - "Response is stale due to upstream failure"',
			});
		}

		if (error instanceof DOMException && error.name === 'TimeoutError') {
			return createJsonResponse(
				{ error: 'GitHub request timed out. Please try again.' },
				504,
				{ 'X-Upstream-Error': 'TIMEOUT' }
			);
		}

		if (isUpstreamError(error)) {
			if (error.status === 404) {
				return createJsonResponse(
					{ error: `GitHub user '${username}' was not found.` },
					404,
					{ 'X-Upstream-Error': 'NOT_FOUND' }
				);
			}

			return createJsonResponse(
				{ error: 'Failed to fetch contributions from GitHub.' },
				502,
				{ 'X-Upstream-Error': String(error.status) }
			);
		}

		return createJsonResponse(
			{ error: 'Unexpected server error while fetching contributions.' },
			500,
			{ 'X-Upstream-Error': 'UNKNOWN' }
		);
	}
};
