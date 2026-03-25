import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { geminiApi } from "../function/gemini-api/resource";

const schema = a.schema({
  // ============================================
  // PRODUCTS - Coffee gear with affiliate links
  // ============================================
  Product: a
    .model({
      // Amazon data
      asin: a.string().required(),
      title: a.string().required(),
      brand: a.string(),
      price: a.float(),
      rating: a.float(),
      reviews: a.integer(),
      thumbnail: a.string(),
      affiliateUrl: a.string().required(),

      // Categorization
      category: a.enum([
        "GRINDER",
        "FILTER",
        "DRIPPER",
        "KETTLE",
        "SCALE",
        "BREWER",
        "ACCESSORY",
      ]),
      subcategory: a.string(), // hand_grinder, electric_grinder, v60_filter, etc.

      // Trait scores (1-10)
      clarityScore: a.integer(),
      bodyScore: a.integer(),
      consistencyScore: a.integer(),
      valueScore: a.integer(),

      // Characteristics
      beginnerFriendly: a.boolean(),
      portability: a.enum(["STATIONARY", "PORTABLE", "TRAVEL"]),
      powerType: a.enum(["MANUAL", "ELECTRIC", "NONE"]),
      priceRange: a.enum(["BUDGET", "MID", "PREMIUM", "LUXURY"]),

      // Matching
      bestFor: a.string().array(), // ['light_roast', 'clarity', 'gesha']
      avoidFor: a.string().array(),
      shortDesc: a.string(),

      // Filter-specific
      flowRate: a.enum(["SLOW", "MEDIUM", "FAST"]), // for filters
      grindSizeRec: a.enum([
        "FINE",
        "MEDIUM_FINE",
        "MEDIUM",
        "MEDIUM_COARSE",
        "COARSE",
      ]),

      // Metadata
      lastPriceUpdate: a.datetime(),
      isActive: a.boolean().default(true),
    })
    .secondaryIndexes((index) => [index("category"), index("asin")])
    .authorization((allow) => [allow.publicApiKey()]),

  // ============================================
  // BREW APPROACHES - Complete brewing methods
  // ============================================
  BrewApproach: a
    .model({
      name: a.string().required(), // "V60 Fine Grind Method"
      slug: a.string().required(), // "v60-fine-grind"

      // When to use this approach
      targetProfiles: a.string().array(), // ['washed_gesha', 'light_roast_floral']
      flavorGoal: a.enum([
        "CLARITY",
        "BODY",
        "BALANCED",
        "SWEETNESS",
        "BRIGHTNESS",
      ]),

      // The technique
      description: a.string().required(),
      grindSize: a.enum([
        "FINE",
        "MEDIUM_FINE",
        "MEDIUM",
        "MEDIUM_COARSE",
        "COARSE",
      ]),
      waterTemp: a.integer(), // Celsius
      ratio: a.string(), // "1:16"
      brewTime: a.string(), // "2:30-3:00"
      technique: a.string(), // "Bloom 45s, slow spiral pour..."

      // Required gear (product IDs or ASINs)
      requiredDripper: a.string(),
      requiredFilter: a.string(),
      recommendedGrinder: a.string(),
      optionalGear: a.string().array(),

      // Why this works
      reasoning: a.string(),

      // Ordering
      priority: a.integer().default(0),
      isActive: a.boolean().default(true),
    })
    .secondaryIndexes((index) => [index("slug"), index("flavorGoal")])
    .authorization((allow) => [allow.publicApiKey()]),

  // ============================================
  // COFFEE PROFILES - Coffee characteristics
  // ============================================
  CoffeeProfile: a
    .model({
      name: a.string().required(), // "Washed Ethiopian Gesha"
      slug: a.string().required(), // "washed-ethiopian-gesha"

      // Origin info
      origin: a.string(),
      region: a.string(),
      variety: a.string(), // gesha, bourbon, typica
      processing: a.enum(["WASHED", "NATURAL", "HONEY", "ANAEROBIC", "OTHER"]),
      roastLevel: a.enum([
        "LIGHT",
        "MEDIUM_LIGHT",
        "MEDIUM",
        "MEDIUM_DARK",
        "DARK",
      ]),

      // Flavor characteristics
      flavorNotes: a.string().array(), // ['jasmine', 'bergamot', 'stone fruit']
      acidity: a.enum(["LOW", "MEDIUM", "HIGH", "BRIGHT"]),
      body: a.enum(["LIGHT", "MEDIUM", "FULL"]),
      sweetness: a.enum(["LOW", "MEDIUM", "HIGH"]),

      // What it needs
      recommendedApproach: a.enum(["CLARITY", "BODY", "BALANCED"]),
      brewingNotes: a.string(), // "Benefits from high extraction, clarity-focused brewing"

      // Linked approaches
      suggestedApproaches: a.string().array(), // approach slugs
    })
    .secondaryIndexes((index) => [index("slug"), index("processing")])
    .authorization((allow) => [allow.publicApiKey()]),

  // ============================================
  // USER PREFERENCES - Track user's setup
  // ============================================
  UserPreference: a
    .model({
      userId: a.string().required(),

      // Their equipment
      ownedProducts: a.string().array(), // product IDs they own

      // Preferences
      preferManual: a.boolean(),
      preferElectric: a.boolean(),
      budgetRange: a.enum(["BUDGET", "MID", "PREMIUM", "NO_LIMIT"]),
      spaceConstrained: a.boolean(),
      travelFrequent: a.boolean(),

      // Taste preferences
      flavorPreference: a.enum(["CLARITY", "BODY", "BALANCED"]),

      // Equipment
      grinder: a.string(),
      dripper: a.string(),
      kettle: a.string(),
      scale: a.string(),

      // Display preferences
      timezone: a.string(), // IANA timezone string e.g. "America/New_York"

      // Tracking
      clickedProducts: a.string().array(), // for conversion tracking
    })
    .secondaryIndexes((index) => [index("userId")])
    .authorization((allow) => [allow.publicApiKey()]),

  // ============================================
  // RECOMMENDATION LOG - Track what we suggest
  // ============================================
  RecommendationLog: a
    .model({
      sessionId: a.string(),
      userId: a.string(),

      // Context
      coffeeProfile: a.string(), // slug
      userQuery: a.string(),

      // What we recommended
      recommendedProducts: a.string().array(),
      recommendedApproaches: a.string().array(),

      // Outcome
      clickedProduct: a.string(),
      convertedProduct: a.string(), // if they bought via affiliate

      timestamp: a.datetime(),
    })
    .authorization((allow) => [allow.publicApiKey()]),

  // ============================================
  // CHAT SESSIONS - User chat history
  // ============================================
  ChatSession: a
    .model({
      userId: a.string(), // null for anonymous, populated for authenticated
      deviceId: a.string(), // for anonymous tracking
      name: a.string().required(),
      messages: a.json().required(), // Array of {id, role, content, timestamp}
      tags: a.string().array(), // User-defined tags e.g. ["gesha", "Ethiopia"]
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
    })
    .secondaryIndexes((index) => [index("userId"), index("deviceId")])
    .authorization((allow) => [
      allow.publicApiKey().to(["create", "read", "update", "delete"]),
      allow.owner(),
    ]),

  // ============================================
  // BREW JOURNAL - User tasting notes
  // ============================================
  // COFFEE BATCH - Represents a specific bag/lot of coffee
  // Identified by roaster + coffeeName + roastDate
  // ============================================
  CoffeeBatch: a
    .model({
      userId: a.string().required(),
      coffeeName: a.string().required(),
      roaster: a.string(),
      roastDate: a.date(),
      origin: a.string(),
      variety: a.string(),
      processing: a.enum(["WASHED", "NATURAL", "HONEY", "ANAEROBIC", "OTHER"]),
      processingNote: a.string(),
      roastLevel: a.enum([
        "LIGHT",
        "MEDIUM_LIGHT",
        "MEDIUM",
        "MEDIUM_DARK",
        "DARK",
      ]),
      roastLevelNote: a.string(),
      color: a.string(), // deterministic hex color derived from id
      notes: a.string(), // general notes about the batch
    })
    .secondaryIndexes((index) => [index("userId")])
    .authorization((allow) => [
      allow.publicApiKey().to(["create", "read", "update", "delete"]),
      allow.owner(),
    ]),

  // ============================================
  BrewJournal: a
    .model({
      userId: a.string(), // null for anonymous, populated for authenticated
      coffeeBatchId: a.string(), // links to CoffeeBatch
      chatSessionIds: a.string().array(), // links to ChatSession (multiple chats can be pinned)

      // Coffee details (kept for backward compat; batch is source of truth when coffeeBatchId set)
      coffeeName: a.string().required(),
      roaster: a.string(),
      roastDate: a.date(),
      origin: a.string(),
      variety: a.string(), // bean variety e.g. gesha, bourbon
      processing: a.enum(["WASHED", "NATURAL", "HONEY", "ANAEROBIC", "OTHER"]),
      processingNote: a.string(), // notes on how processing affected the cup
      roastLevel: a.enum([
        "LIGHT",
        "MEDIUM_LIGHT",
        "MEDIUM",
        "MEDIUM_DARK",
        "DARK",
      ]),
      roastLevelNote: a.string(), // notes on how roast level affected the cup

      // Brew details
      brewMethod: a.string(),
      grindSize: a.string(),
      waterTemp: a.integer(), // Celsius
      brewTime: a.string(), // "2:30"
      ratio: a.string(), // "1:16"
      dose: a.string(), // "20g"
      yield: a.string(), // "320g"
      daysFromRoast: a.integer(), // days between roastDate and brewDate

      // Extraction metrics
      tds: a.float(), // Total Dissolved Solids (%) e.g. 1.35
      extractionYield: a.float(), // Extraction yield (%) e.g. 20.1
      extractionNote: a.string(), // free-text observations on extraction

      // Tasting notes
      tastingNotes: a.string(), // main journal entry (markdown supported)
      flavorNotes: a.string().array(), // ['blueberry', 'chocolate']
      rating: a.integer(), // 1-10

      // Aroma
      aroma: a.integer(), // dry aroma score 1-5
      aromaNote: a.string(), // free text aroma description

      // Experience
      clarity: a.integer(), // 1-10
      body: a.integer(), // 1-10
      sweetness: a.integer(), // 1-10
      acidity: a.integer(), // 1-10
      finish: a.integer(), // aftertaste score 1-5
      florality: a.integer(), // floral/herbal score 1-5
      bitterness: a.integer(), // bitterness score 1-5
      spicy: a.integer(), // spicy/peppery notes 1-5
      salty: a.integer(), // saltiness / mineral quality 1-5
      berryFruit: a.integer(), // berry fruit notes 1-5
      citrusFruit: a.integer(), // citrus fruit notes 1-5
      stoneFruit: a.integer(), // stone fruit notes 1-5
      chocolate: a.integer(), // chocolate notes 1-5
      caramel: a.integer(), // caramel notes 1-5
      smoky: a.integer(), // smoky notes 1-5
      savory: a.integer(), // savory / umami notes 1-5
      finishNote: a.string(), // free text finish description

      // Metadata
      brewDate: a.datetime(),
      photos: a.string().array(), // S3 URLs (future)
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
    })
    .secondaryIndexes((index) => [index("userId"), index("coffeeBatchId")])
    .authorization((allow) => [
      allow.publicApiKey().to(["create", "read", "update", "delete"]),
      allow.owner(),
    ]),

  // ============================================
  // GEMINI AI - Custom queries via Lambda
  // ============================================
  geminiChat: a
    .query()
    .arguments({
      messages: a.string().array().required(), // JSON stringified messages
      systemPrompt: a.string(),
    })
    .returns(a.string()) // JSON response
    .authorization((allow) => [allow.publicApiKey()])
    .handler(a.handler.function(geminiApi)),

  geminiVision: a
    .query()
    .arguments({
      imageBase64: a.string().required(),
      prompt: a.string(),
    })
    .returns(a.string()) // JSON response
    .authorization((allow) => [allow.publicApiKey()])
    .handler(a.handler.function(geminiApi)),

  extractJournalFields: a
    .query()
    .arguments({
      messages: a.string().array().required(), // JSON stringified messages
    })
    .returns(a.string()) // JSON response with extracted fields
    .authorization((allow) => [allow.publicApiKey()])
    .handler(a.handler.function(geminiApi)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "apiKey",
    apiKeyAuthorizationMode: {
      expiresInDays: 30,
    },
  },
});
