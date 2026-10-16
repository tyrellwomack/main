var sheetName = 'Email List'
var duplicatesSheetName = 'Duplicates'
var scriptProp = PropertiesService.getScriptProperties()

function intialSetup () {
  var activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet()
  scriptProp.setProperty('key', activeSpreadsheet.getId())
}

/**
 * POST handler: appends incoming row to 'Email List' while preventing duplicates.
 * - Normalizes incoming email (trim + lowercase).
 * - Checks existing emails in the sheet (case-insensitive).
 * - If duplicate found, appends the row to a "Duplicates" sheet (with an extra "reason" column).
 * - Uses a script lock to avoid race conditions.
 */
function doPost (e) {
  var lock = LockService.getScriptLock()
  if (!lock.tryLock(10000)) {
    return ContentService.createTextOutput(
      JSON.stringify({ result: 'error', error: 'Could not obtain lock' })
    ).setMimeType(ContentService.MimeType.JSON)
  }

  try {
    var doc = SpreadsheetApp.openById(scriptProp.getProperty('key'))
    var sheet = doc.getSheetByName(sheetName)
    if (!sheet) {
      return ContentService.createTextOutput(
        JSON.stringify({ result: 'error', error: 'Main sheet not found: ' + sheetName })
      ).setMimeType(ContentService.MimeType.JSON)
    }

    // Ensure duplicates sheet exists
    var dupSheet = doc.getSheetByName(duplicatesSheetName)
    if (!dupSheet) {
      dupSheet = doc.insertSheet(duplicatesSheetName)
    }

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    var nextRow = sheet.getLastRow() + 1

    // Find email header index
    var emailHeaderIndex = headers.indexOf('email')
    var incomingEmail = ''
    if (emailHeaderIndex !== -1) {
      incomingEmail = (e.parameter['email'] || '').toString().trim().toLowerCase()
      if (incomingEmail === '') {
        return ContentService.createTextOutput(
          JSON.stringify({ result: 'error', error: 'Missing email' })
        ).setMimeType(ContentService.MimeType.JSON)
      }
    }

    // Read existing emails and normalize
    var existing = []
    if (emailHeaderIndex !== -1 && sheet.getLastRow() >= 2) {
      var emailCol = emailHeaderIndex + 1
      var numRows = sheet.getLastRow() - 1
      var emailRange = sheet.getRange(2, emailCol, numRows, 1)
      existing = emailRange.getValues().map(function(r){ return (r[0] || '').toString().trim().toLowerCase() })
    }

    // Build the new row values (use normalized incomingEmail for 'email' column)
    var newRow = headers.map(function(header) {
      if (header === 'timestamp') return new Date()
      if (header === 'email') return incomingEmail
      return e.parameter[header] || ''
    })

    // If duplicate, write to Duplicates sheet (instead of appending to main sheet)
    if (emailHeaderIndex !== -1 && existing.indexOf(incomingEmail) !== -1) {
      // Ensure duplicates sheet has headers (copy main headers + reason column)
      var dupHeaders = dupSheet.getLastRow() === 0
      if (dupHeaders) {
        dupSheet.getRange(1, 1, 1, headers.length + 1).setValues([headers.concat(['reason'])])
      }

      var dupNext = dupSheet.getLastRow() + 1
      dupSheet.getRange(dupNext, 1, 1, newRow.length + 1).setValues([newRow.concat(['duplicate email'])])

      return ContentService.createTextOutput(
        JSON.stringify({ result: 'duplicate', row: dupNext, sheet: duplicatesSheetName, email: incomingEmail })
      ).setMimeType(ContentService.MimeType.JSON)
    }

    // Append to main sheet
    sheet.getRange(nextRow, 1, 1, newRow.length).setValues([newRow])

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'success', row: nextRow }))
      .setMimeType(ContentService.MimeType.JSON)
  }

  catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'error', error: err.message || err }))
      .setMimeType(ContentService.MimeType.JSON)
  }

  finally {
    lock.releaseLock()
  }
}
