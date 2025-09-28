// Test what the correct MediaReference format should be
// Based on the error, let's see what formats might work

console.log("Possible MediaReference formats:");

console.log("\n1. Current format (failing):");
console.log(JSON.stringify({ $rid: "ri.mio.main.media-item.01998f70-43fc-7852-a6fa-e9b1601c8b2c" }, null, 2));

console.log("\n2. Just the RID string:");
console.log(JSON.stringify("ri.mio.main.media-item.01998f70-43fc-7852-a6fa-e9b1601c8b2c", null, 2));

console.log("\n3. MediaSet + MediaItem format:");
console.log(JSON.stringify({
  mediaSetRid: "ri.mio.main.media-set.6b57b513-6e54-4f04-b779-2a3a3f9753c8",
  mediaItemRid: "ri.mio.main.media-item.01998f70-43fc-7852-a6fa-e9b1601c8b2c"
}, null, 2));

console.log("\n4. Reference object format:");
console.log(JSON.stringify({
  reference: {
    $rid: "ri.mio.main.media-item.01998f70-43fc-7852-a6fa-e9b1601c8b2c"
  }
}, null, 2));

console.log("\nLet's try using the getMediaReference API to get the correct format...");
