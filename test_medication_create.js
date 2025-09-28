// Test script to verify the medication create endpoint format
const testPayload = {
  parameters: {
    user_id: "test-user-123",
    timestamp: new Date().toISOString(),
    photolabel: { $rid: "ri.mio.main.media-item.test-123" }
  },
  options: {
    returnEdits: "ALL"
  }
};

console.log("Expected Foundry API payload format:");
console.log(JSON.stringify(testPayload, null, 2));

// Compare with the documentation example
const docExample = {
  parameters: {
    user_id: "value",
    timestamp: "2025-09-28T08:29:29.924Z",
    photolabel: {}
  },
  options: {
    returnEdits: "ALL"
  }
};

console.log("\nFoundry documentation example:");
console.log(JSON.stringify(docExample, null, 2));

console.log("\nKey difference: photolabel should be { $rid: 'media-item-rid' } not {}");
