import { util } from "@aws-appsync/utils";

export function request(ctx) {
  if (!ctx.identity || !ctx.identity.sub) {
    util.unauthorized();
  }

  const userId = ctx.identity.sub + "::" + ctx.identity.username;
  const content = ctx.args.content;
  const tags = ctx.args.tags;

  // Build tag filters (one term per tag = AND logic)
  const tagFilters = tags && tags.length > 0
    ? tags.map(function (tag) { return { term: { "tags.keyword": tag } }; })
    : [];

  // Owner filter always applied; concat tag filters
  const filter = [{ term: { "owner.keyword": userId } }].concat(tagFilters);

  // Full-text must clause — match_all when no text query
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
            must: must,
            filter: filter,
          },
        },
      },
    },
    resourcePath: "/chatsession/_search",
  };
}

export function response(ctx) {
  const { statusCode, body } = ctx.result;
  if (statusCode === 200) {
    return JSON.parse(body).hits.hits.map(function (hit) { return hit._source; });
  }
}
