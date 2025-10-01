# Media Reference Upload Fix

## Problem

The backend was receiving `INVALID_ARGUMENT` errors when creating `AtlasIntraencounterProduction` records:

```json
{
  "errorCode": "INVALID_ARGUMENT",
  "errorName": "InvalidParameterValue",
  "errorInstanceId": "...",
  "parameters": {
    "parameterBaseType": "MediaReference",
    "parameterId": "audiofile",
    "parameterValue": {
      "$rid": "ri.mio.main.media-item.0199a0af-e2a6-7413-b759-6a3c5b8eb081"
    }
  }
}
```

## Root Cause

### ❌ Incorrect Approach (Before Fix)

The service was uploading media files directly to the **Media Set API**:

```
POST /api/v2/mediasets/{mediaSetRid}/items
```

This endpoint returns a media item RID, which was then wrapped as `{"$rid": "..."}` and passed to the ontology action. However, Foundry's action validation rejected this because **the media item was not properly associated with the object type's property schema**.

### ✅ Correct Approach (After Fix)

Per [Palantir Foundry API documentation](https://www.palantir.com/docs/foundry/api/ontology-resources/objects/media/upload-media-content/), media files must be uploaded via the **Ontology Object Type Media Property endpoint**:

```
POST /api/v2/ontologies/{ontology}/objectTypes/{objectType}/media/{property}/upload?preview=true
```

This endpoint:
1. Associates the uploaded media with the specific object type and property
2. Returns a properly formatted `MediaReference` object
3. Ensures the reference passes Foundry's action validation

## Changes Made

### `src/services/mediaUploadService.js`

1. **Updated `uploadAudioFile` method**:
   - Changed `objectType` from `'MediaUpload'` to `'AtlasIntraencounterProduction'`
   - Changed `property` from `'mediaFile'` to `'audiofile'`
   - Changed method call from `uploadToFoundryMediaEndpoint` to `uploadViaOntologyMediaEndpoint`

2. **Updated `uploadImageFile` method**:
   - Updated comments for clarity
   - Changed method call from `uploadToFoundryMediaEndpoint` to `uploadViaOntologyMediaEndpoint`

3. **Replaced `uploadToFoundryMediaEndpoint` with `uploadViaOntologyMediaEndpoint`**:
   ```javascript
   async uploadViaOntologyMediaEndpoint(fileBuffer, objectType, property, mediaItemPath, contentType, userId) {
     const uploadUrl = `${this.foundryHost}/api/v2/ontologies/${this.ontologyApiName}/objectTypes/${objectType}/media/${property}/upload?mediaItemPath=${encodeURIComponent(mediaItemPath)}&preview=true`;
     
     const uploadResponse = await fetch(uploadUrl, {
       method: 'POST',
       headers: {
         'Authorization': `Bearer ${token}`,
         'Content-Type': 'application/octet-stream'
       },
       body: fileBuffer
     });
     
     const result = await uploadResponse.json();
     return {
       ...result,
       reference: result.reference || result
     };
   }
   ```

4. **Simplified `createIntraencounterProduction` method**:
   - Removed MediaReference normalization logic
   - Now uses the MediaReference directly as returned from the upload endpoint

## API Endpoint Details

### For Audio Files (Intraencounter)
- **Ontology**: `ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194`
- **Object Type**: `AtlasIntraencounterProduction`
- **Property**: `audiofile`
- **Endpoint**: `POST /api/v2/ontologies/ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194/objectTypes/AtlasIntraencounterProduction/media/audiofile/upload`

### For Image Files (Medications)
- **Ontology**: `ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194`
- **Object Type**: `MedicationsUpload`
- **Property**: `photolabel`
- **Endpoint**: `POST /api/v2/ontologies/ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194/objectTypes/MedicationsUpload/media/photolabel/upload`

## Expected Result

After this fix:
1. ✅ Audio uploads will be properly associated with the `AtlasIntraencounterProduction.audiofile` property
2. ✅ The returned `MediaReference` will pass Foundry's action validation
3. ✅ No more `INVALID_ARGUMENT` errors for `audiofile` parameter
4. ✅ Intraencounter records will be created successfully

## Testing

To verify the fix works:

1. **Upload an audio file** via the iOS app or API:
   ```bash
   POST /api/v1/foundry/ontologies/{ontology}/actions/createAtlasIntraencounterProduction/apply
   ```

2. **Check logs** for successful upload:
   ```
   MediaUploadService: Uploading via ontology media property endpoint
   MediaUploadService: Ontology media upload successful
   MediaUploadService: Foundry action successful
   ```

3. **Verify no errors** in the response (should be 201 Created, not 400 Bad Request)

## Related Files

- `/backend-proxy/src/services/mediaUploadService.js` - Media upload service (fixed)
- `/backend-proxy/src/routes/foundry.js` - Route handlers (no changes needed)
- `/backend-proxy/src/services/foundryService.js` - Foundry service (no changes needed)

## References

- [Palantir Foundry API - Upload Media Content](https://www.palantir.com/docs/foundry/api/ontology-resources/objects/media/upload-media-content/)
- Original error logs: See user's query with correlation IDs
- Ontology API Name: `ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194`

## Migration Notes

No database migration or data cleanup needed. The fix is purely in the upload mechanism. Existing media items uploaded via the old method will remain in the media sets but won't be associated with any object instances.

