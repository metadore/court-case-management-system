import { prisma } from "@tpt-court/database";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SearchResult {
  id: string;
  caseNumber: string;
  title: string;
  type: string;
  status: string;
  filedAt: Date;
  description: string | null;
  rank: number;
  assignedJudge: { firstName: string; lastName: string } | null;
}

export interface SearchParams {
  q: string;
  status?: string;
  type?: string;
  judgeId?: string;
  dateFrom?: string;
  dateTo?: string;
  partyName?: string;
  isPublic?: boolean;
  page?: number;
  pageSize?: number;
}

export interface SearchResponse {
  data: SearchResult[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── Configuration ──────────────────────────────────────────────────────────

/**
 * Weight configuration for full-text search ranking.
 * - A (highest): caseNumber exact match
 * - B: title
 * - C: description
 * - D: tags
 */
const TS_CONFIG = "english";

// ── Search Helpers ─────────────────────────────────────────────────────────

/**
 * Build a tsquery string from a search query.
 * Handles multiple words, partial matches, and special characters.
 */
function buildTsQuery(query: string): string {
  // Sanitize the query - remove special characters that could break tsquery
  const sanitized = query
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!sanitized) return "";

  // Split into words and create a prefix-matching tsquery
  const words = sanitized.split(" ").filter(Boolean);
  // Use & (AND) between words for precise matching, with prefix matching (:*) for partial matches
  const tsqueryParts = words.map((word) => `${word}:*`);
  return tsqueryParts.join(" & ");
}

/**
 * Escape special characters for ILIKE patterns.
 */
function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, "\\$&");
}

/**
 * Perform a PostgreSQL full-text search across cases.
 * Falls back to ILIKE-based search for short queries (< 3 chars).
 */
export async function searchCases(params: SearchParams): Promise<SearchResponse> {
  const {
    q,
    status,
    type,
    judgeId,
    dateFrom,
    dateTo,
    partyName,
    isPublic,
    page = 1,
    pageSize = 10,
  } = params;

  const pageNum = Math.max(1, page);
  const limit = Math.min(100, Math.max(1, pageSize));
  const offset = (pageNum - 1) * limit;

  // Build WHERE conditions
  const conditions: string[] = ["1=1"];
  const queryParams: unknown[] = [];
  let paramIndex = 1;

  // Text search - use full-text search for queries >= 3 chars, ILIKE for shorter
  if (q && q.trim().length >= 3) {
    const tsquery = buildTsQuery(q);
    if (tsquery) {
      // Use PostgreSQL full-text search with weighted ts_vector
      conditions.push(`
        to_tsvector($${paramIndex++}::regconfig,
          coalesce(case_number, '') || ' ' ||
          coalesce(title, '') || ' ' ||
          coalesce(description, '') || ' ' ||
          coalesce(array_to_string(tags, ' '), '')
        ) @@ to_tsquery($${paramIndex++}::regconfig, $${paramIndex++}::text)
      `);
      queryParams.push(TS_CONFIG, TS_CONFIG, tsquery);
    }
  } else if (q && q.trim().length > 0) {
    // Fall back to ILIKE for short queries
    const likePattern = `%${escapeLike(q.trim())}%`;
    conditions.push(`
      (case_number ILIKE $${paramIndex} OR title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})
    `);
    queryParams.push(likePattern);
    paramIndex++;
  }

  // Status filter
  if (status) {
    conditions.push(`status = $${paramIndex}`);
    queryParams.push(status);
    paramIndex++;
  }

  // Type filter
  if (type) {
    conditions.push(`"type" = $${paramIndex}`);
    queryParams.push(type);
    paramIndex++;
  }

  // Judge filter
  if (judgeId) {
    conditions.push(`assigned_judge_id = $${paramIndex}`);
    queryParams.push(judgeId);
    paramIndex++;
  }

  // Date range
  if (dateFrom) {
    conditions.push(`filed_at >= $${paramIndex}::timestamp`);
    queryParams.push(dateFrom);
    paramIndex++;
  }

  if (dateTo) {
    conditions.push(`filed_at <= $${paramIndex}::timestamp`);
    queryParams.push(dateTo);
    paramIndex++;
  }

  // Party name filter (search parties table)
  if (partyName) {
    conditions.push(`
      c.id IN (
        SELECT p.case_id FROM parties p 
        WHERE p.name ILIKE $${paramIndex}
      )
    `);
    queryParams.push(`%${escapeLike(partyName)}%`);
    paramIndex++;
  }

  // Public filter
  if (isPublic !== undefined) {
    conditions.push(`is_public = $${paramIndex}`);
    queryParams.push(isPublic);
    paramIndex++;
  }

  const whereClause = conditions.join(" AND ");

  // Record WHERE-only param count before ORDER BY params are added.
  // The count query only needs WHERE params, not ORDER BY or LIMIT/OFFSET.
  const whereParamCount = paramIndex - 1;

  // Build ordering - use ts_rank for relevance when full-text searching, otherwise use filed_at
  let orderClause = "ORDER BY c.filed_at DESC";
  if (q && q.trim().length >= 3) {
    const tsquery = buildTsQuery(q);
    if (tsquery) {
      orderClause = `
        ORDER BY ts_rank(
          to_tsvector($${paramIndex}::regconfig,
            coalesce(c.case_number, '') || ' ' ||
            coalesce(c.title, '') || ' ' ||
            coalesce(c.description, '') || ' ' ||
            coalesce(array_to_string(c.tags, ' '), '')
          ),
          to_tsquery($${paramIndex + 1}::regconfig, $${paramIndex + 2}::text)
        ) DESC, c.filed_at DESC
      `;
      queryParams.push(TS_CONFIG, TS_CONFIG, tsquery);
      paramIndex += 3;
    }
  }

  // Count query
  const countSql = `
    SELECT COUNT(*) as total
    FROM cases c
    WHERE ${whereClause}
  `;

  // Data query with pagination
  const dataSql = `
    SELECT
      c.id,
      c.case_number as "caseNumber",
      c.title,
      c.type,
      c.status,
      c.filed_at as "filedAt",
      c.description,
      json_build_object(
        'firstName', u.first_name,
        'lastName', u.last_name
      ) as "assignedJudge"
    FROM cases c
    LEFT JOIN users u ON u.id = c.assigned_judge_id
    WHERE ${whereClause}
    ${orderClause}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  queryParams.push(limit, offset);

  try {
    const [countResult, dataResult] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ total: bigint }>>(countSql, ...queryParams.slice(0, whereParamCount)),
      prisma.$queryRawUnsafe<SearchResult[]>(dataSql, ...queryParams),
    ]);

    const total = Number(countResult[0]?.total ?? 0);

    return {
      data: dataResult,
      total,
      page: pageNum,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    };
  } catch (error) {
    console.error("[search] Full-text search failed, falling back to basic search:", error);
    // Fallback: simple search using prisma findMany
    return fallbackSearch(params);
  }
}

/**
 * Fallback search using Prisma's findMany with ILIKE.
 */
async function fallbackSearch(params: SearchParams): Promise<SearchResponse> {
  const { q, status, type, page = 1, pageSize = 10 } = params;

  const pageNum = Math.max(1, page);
  const limit = Math.min(100, Math.max(1, pageSize));

  const where: Record<string, unknown> = {};

  if (q && q.trim().length >= 2) {
    where["OR"] = [
      { title: { contains: q, mode: "insensitive" } },
      { caseNumber: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  if (status) where["status"] = status;
  if (type) where["type"] = type;

  const [data, total] = await Promise.all([
    prisma.case.findMany({
      where,
      select: {
        id: true,
        caseNumber: true,
        title: true,
        type: true,
        status: true,
        filedAt: true,
        description: true,
        assignedJudge: {
          select: { firstName: true, lastName: true },
        },
      },
      skip: (pageNum - 1) * limit,
      take: limit,
      orderBy: { filedAt: "desc" },
    }),
    prisma.case.count({ where }),
  ]);

  return {
    data: data as unknown as SearchResult[],
    total,
    page: pageNum,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
  };
}