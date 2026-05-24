#!/bin/bash
# Build Chrome Extension package

ZIP_NAME="freeclipboard-extension.zip"

# Remove old zip if exists
rm -f "$ZIP_NAME"

# Create zip excluding build scripts and DS_Store
zip -r "$ZIP_NAME" . \
  -x "*.sh" \
  -x ".DS_Store" \
  -x "*.zip" \
  -x ".git/*" \
  -x "node_modules/*"

echo ""
echo "Extension zipped: $ZIP_NAME"
echo "File size: $(du -h "$ZIP_NAME" | cut -f1)"
