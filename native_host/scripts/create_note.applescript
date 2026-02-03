on splitString(theText, theDelimiter)
	set AppleScript's text item delimiters to theDelimiter
	set theItems to every text item of theText
	set AppleScript's text item delimiters to ""
	return theItems
end splitString

on ensureFolderPath(theAccount, folderPath)
	tell application "Notes"
		if folderPath is "" then
			return default folder of theAccount
		end if
		
		set parts to my splitString(folderPath, "/")
		set containerObj to theAccount
		repeat with p in parts
			set seg to contents of p
			if seg is not "" then
				if containerObj is theAccount then
					if not (exists folder seg of theAccount) then
						make new folder at theAccount with properties {name:seg}
					end if
					set containerObj to folder seg of theAccount
				else
					if not (exists folder seg of containerObj) then
						make new folder at containerObj with properties {name:seg}
					end if
					set containerObj to folder seg of containerObj
				end if
			end if
		end repeat
		return containerObj
	end tell
end ensureFolderPath

on run argv
	set accountName to item 1 of argv
	set folderPath to item 2 of argv
	set noteTitle to item 3 of argv
	set htmlPath to item 4 of argv
	
	tell application "Notes"
		if accountName is "" then
			set theAccount to default account
		else
			set theAccount to first account whose name is accountName
		end if
		
		set theFolder to my ensureFolderPath(theAccount, folderPath)
		set htmlBody to read (POSIX file htmlPath) as «class utf8»
		set newNote to make new note at theFolder with properties {name:noteTitle, body:htmlBody}
		return id of newNote
	end tell
end run
