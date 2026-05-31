import { Amplify } from "aws-amplify";
import outputs from "../amplify_outputs.json";

const appsyncGraphqlUrl = import.meta.env.VITE_APPSYNC_GRAPHQL_URL;

const amplifyConfig = appsyncGraphqlUrl
  ? {
      ...outputs,
      data: {
        ...outputs.data,
        url: appsyncGraphqlUrl,
      },
    }
  : outputs;

Amplify.configure(amplifyConfig);
