!include "FileFunc.nsh"
!include "TextFunc.nsh"

!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON1 "是否同时删除小说文件夹中的发布记录？删除后，以后可能无法识别已经提交过的章节。" /SD IDYES IDNO skipNovelRecords

  IfFileExists "$APPDATA\fanqie-publish-tool\generated-files.txt" 0 skipNovelRecords
  FileOpen $0 "$APPDATA\fanqie-publish-tool\generated-files.txt" r

  readGeneratedFile:
    ClearErrors
    FileRead $0 $1
    IfErrors closeGeneratedFile
    ${TrimNewLines} $1 $1
    ${GetFileName} "$1" $2
    StrCmp $2 ".fanqie-publish.json" 0 readGeneratedFile
    Delete "$1"
    Goto readGeneratedFile

  closeGeneratedFile:
    FileClose $0

  skipNovelRecords:
    RMDir /r "$APPDATA\fanqie-publish-tool"
!macroend
