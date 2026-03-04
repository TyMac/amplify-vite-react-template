import { util } from "@aws-appsync/utils";

export function request(ctx) {
  // Require authentication to search
  if (!ctx.identity || !ctx.identity.sub) {
    util.unauthorized();
  }

  const userId = `${ctx.identity.sub}::${ctx.identity.username}`;
  const { content, tags } = ctx.args;

  // Base owner filter — always applied
  const filters = [{ term: { "owner.keyword": userId } }];

  // Optional tag filter — requires ALL provided tags to be present
  if (tags && tags.length > 0) {
    tags.forEach((tag) => {
      filters.push({ term: { "tags.keyword": tag } });
    });
  }

  // Build must clause — full-text search only when content is provided
  const must = content && content.trim() !== ""
    ? [{ multi_match: { query: content, fields: ["name", "messages"] } }]
    : [{ match_all: {} }];

  return {
    version: "2018-05-29",
    method: "GET",
    params: {
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        from: 0,
        size: 50,
        query: {
          bool: {
            must,
            filter: filters,
          },
        },
        sort: [{ "updatedAt.keyword": { order: "desc" } }],
      },
    },
    resourcePath: `/chatsession/_search`,
  };
}

/**
 * Returns the fetched items
 * @param {import('@aws-appsync/utils').Context} ctx the context
 * @returns {*} the result
 */
export function response(ctx) {
  const { statusCode, body } = ctx.result;
  if (statusCode === 200) {
    return JSON.parse(body).hits.hits.map((hit) => hit._source);
  }
}
