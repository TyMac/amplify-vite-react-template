import { util } from "@aws-appsync/utils";

export function request(ctx) {
  // Require authentication to search
  if (!ctx.identity || !ctx.identity.sub) {
    util.unauthorized();
  }

  const userId = `${ctx.identity.sub}::${ctx.identity.username}`;

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
            must: [
              {
                multi_match: {
                  query: ctx.args.content,
                  fields: ["name", "messages"],
                },
              },
            ],
            filter: [
              {
                term: {
                  owner: userId,
                },
              },
            ],
          },
        },
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
