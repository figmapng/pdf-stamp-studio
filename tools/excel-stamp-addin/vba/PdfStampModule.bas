Attribute VB_Name = "PdfStampModule"
Option Explicit

' =========================================================================
' PDF Stamp Studio - Excel add-in engine (Excel 2007 .. Microsoft 365, 32/64-bit)
'
' Step 1  (button 1, show signatures): finds every configured signer in the open
'         workbook and drops the signature / stamp PNGs onto the sheet as ordinary
'         movable pictures (shapes named PSS_*). The user can drag / resize them.
' Step 2  (button 2, save PDF): exports ALL visible sheets in workbook order to one
'         PDF (pictures included) and removes the pictures again, so the
'         original Excel file stays clean.
'
' Configuration is written by the Windows app into
'   %APPDATA%\PdfStampStudio\config16.ini  (UTF-16, preferred)
'   %APPDATA%\PdfStampStudio\config.ini    (UTF-8, fallback)
'   %APPDATA%\PdfStampStudio\assets\*.png
' No network access is used anywhere.
'
' Compatibility rules followed here:
'   * no early-bound references, no Declare statements (works in 32 and 64-bit)
'   * no Scripting.Dictionary (VBA Collection instead); FSO / WScript / ADODB are
'     optional and have fallbacks, because some companies block them
'   * large sheets are scanned in blocks, never as one giant array
' =========================================================================

Private Const APP_FOLDER As String = "PdfStampStudio"
Private Const SHAPE_PREFIX As String = "PSS_"
Private Const MSG_TITLE As String = "PDF Stamp Studio"

Private Type Candidate
    Found As Boolean
    SheetIndex As Long
    Row As Long
    Col As Long
    Score As Long
    Text As String
End Type

Private mSavedFlags As Collection   ' workbook full name -> original Saved flag
Private mLastError As String

' -------------------------------------------------------------------------
' Decodes \uXXXX escapes (the installer stores all non-ASCII text that way,
' so the add-in works on every Windows code page)
' -------------------------------------------------------------------------
Private Function U(ByVal s As String) As String
    Dim p As Long
    p = InStr(s, "\u")
    Do While p > 0
        s = Left$(s, p - 1) & ChrW(CLng("&H" & Mid$(s, p + 2, 4))) & Mid$(s, p + 6)
        p = InStr(p + 1, s, "\u")
    Loop
    U = s
End Function

' -------------------------------------------------------------------------
' Startup
' -------------------------------------------------------------------------
Public Sub Auto_Open()
    On Error Resume Next
    Application.OnKey "+^P", "RunPdfStampStudio"
    On Error GoTo 0
End Sub

Public Sub Auto_Close()
    On Error Resume Next
    Application.OnKey "+^P"
    On Error GoTo 0
End Sub

' -------------------------------------------------------------------------
' Ribbon callbacks
' -------------------------------------------------------------------------
Public Sub PdfStampRibbonPreview(control As IRibbonControl)
    ShowStampPreview
End Sub

Public Sub PdfStampRibbonSave(control As IRibbonControl)
    SavePdfWithStamps
End Sub

Public Sub PdfStampRibbonClear(control As IRibbonControl)
    ClearStampPreview
End Sub

Public Sub PdfStampRibbonSettings(control As IRibbonControl)
    OpenSettingsApp
End Sub

' Ctrl+Shift+P: first press shows the preview, second press saves the PDF
Public Sub RunPdfStampStudio()
    Dim wb As Workbook
    Set wb = GetWorkbook()
    If wb Is Nothing Then Exit Sub
    If CountOverlays(wb) > 0 Then
        SavePdfWithStamps
    Else
        ShowStampPreview
    End If
End Sub

' =========================================================================
' STEP 1 - show signatures and stamps on the sheet
' =========================================================================
Public Sub ShowStampPreview()
    Dim wb As Workbook
    Set wb = GetWorkbook()
    If wb Is Nothing Then Exit Sub

    Dim cfg As Collection
    Set cfg = LoadConfig()
    If cfg Is Nothing Then Exit Sub

    Dim sigCount As Long, stampCount As Long
    sigCount = CLng(Val(CfgGet(cfg, "General", "SignerCount", "0")))
    stampCount = CLng(Val(CfgGet(cfg, "General", "StampCount", "0")))
    If sigCount = 0 And stampCount = 0 Then
        MsgBox "В программе «PDF Stamp Studio» ещё не добавлены подписи и печати." & vbCrLf & vbCrLf & _
               "Откройте программу, перейдите на вкладку «Подпись и печать», добавьте подписанта и загрузите его подпись.", _
               vbInformation, MSG_TITLE
        Exit Sub
    End If

    Dim prevScreen As Boolean
    prevScreen = Application.ScreenUpdating
    Dim startSheet As Object
    Set startSheet = ActiveSheet
    Dim wasSaved As Boolean
    wasSaved = wb.Saved

    Application.StatusBar = False
    Application.ScreenUpdating = False
    On Error GoTo Fail

    RemoveOverlays wb
    RememberSavedFlag wb, wasSaved

    Dim problems As String
    Dim placed As Collection
    Set placed = New Collection   ' signer id -> Shape

    Dim i As Long
    Dim firstShape As Shape
    Dim lastSig As Shape
    Dim okSigners As Long, okStamps As Long

    ' ---- signers ----
    For i = 1 To sigCount
        Dim sec As String
        sec = "Signer" & i
        Dim sId As String
        sId = CfgGet(cfg, sec, "Id", CStr(i))
        If CfgGet(cfg, sec, "Enabled", "1") = "1" Then
            Dim label As String
            label = CfgGet(cfg, sec, "FullName", sec)
            Dim imgPath As String
            imgPath = AssetPath(CfgGet(cfg, sec, "ImageFile", ""))
            If Len(imgPath) = 0 Then
                problems = problems & "• " & label & ": не загружена подпись (PNG)." & vbCrLf
            Else
                Dim cand As Candidate
                cand = FindSigner(wb, cfg, i, sigCount)
                If Not cand.Found Then
                    problems = problems & "• " & label & ": имя не найдено в файле. Поставьте подпись вручную." & vbCrLf
                Else
                    Dim ws As Worksheet
                    Set ws = wb.Worksheets(cand.SheetIndex)
                    If Not EnsureEditable(ws) Then
                        problems = problems & "• " & label & ": лист «" & ws.Name & "» защищён паролем." & vbCrLf
                    Else
                        Dim shp As Shape
                        Set shp = PlaceSignature(ws, cand, imgPath, _
                                    CDbl(Val(CfgGet(cfg, sec, "WidthPt", "110"))), sId, label)
                        If shp Is Nothing Then
                            problems = problems & "• " & label & ": не удалось вставить картинку (" & mLastError & ")." & vbCrLf
                        Else
                            On Error Resume Next
                            placed.Add shp, sId
                            On Error GoTo Fail
                            Set lastSig = shp
                            okSigners = okSigners + 1
                            If firstShape Is Nothing Then Set firstShape = shp
                        End If
                    End If
                End If
            End If
        End If
    Next i

    ' ---- stamps ----
    For i = 1 To stampCount
        Dim stSec As String
        stSec = "Stamp" & i
        If CfgGet(cfg, stSec, "Enabled", "1") = "1" Then
            Dim stLabel As String
            stLabel = CfgGet(cfg, stSec, "Label", stSec)
            Dim stImg As String
            stImg = AssetPath(CfgGet(cfg, stSec, "ImageFile", ""))
            If Len(stImg) = 0 Then
                problems = problems & "• Печать «" & stLabel & "»: не загружен PNG." & vbCrLf
            Else
                Dim owner As String
                owner = CfgGet(cfg, stSec, "Owner", "MANUAL_PER_DOCUMENT")
                Dim ownerShape As Shape
                Set ownerShape = Nothing
                Dim manual As Boolean
                manual = False
                If owner = "MANUAL_PER_DOCUMENT" Or Len(owner) = 0 Then
                    manual = True
                    Set ownerShape = lastSig
                ElseIf HasKey(placed, owner) Then
                    Set ownerShape = placed(owner)
                End If

                If ownerShape Is Nothing Then
                    problems = problems & "• Печать «" & stLabel & "»: подписант-владелец не найден в файле." & vbCrLf
                Else
                    Dim st As Shape
                    Set st = PlaceStamp(ownerShape, stImg, stSec, cfg, manual, stLabel)
                    If st Is Nothing Then
                        problems = problems & "• Печать «" & stLabel & "»: не удалось вставить картинку (" & mLastError & ")." & vbCrLf
                    Else
                        okStamps = okStamps + 1
                        If manual Then problems = problems & "• Печать «" & stLabel & "»: владелец «вручную» — проверьте положение." & vbCrLf
                    End If
                End If
            End If
        End If
    Next i

    Application.ScreenUpdating = True
    On Error Resume Next
    If Not firstShape Is Nothing Then
        firstShape.Parent.Activate
        Application.Goto firstShape.TopLeftCell, True
        firstShape.Select
    ElseIf Not startSheet Is Nothing Then
        startSheet.Activate
    End If
    On Error GoTo 0

    Application.StatusBar = "Подписи и печати показаны (" & okSigners & " подп., " & okStamps & " печ.). " & _
        "Проверьте положение, при необходимости перетащите мышью, затем нажмите «Сохранить PDF»."

    If okSigners + okStamps = 0 Then RestoreSavedFlag wb

    If Len(problems) > 0 Then
        MsgBox "Нужно проверить:" & vbCrLf & vbCrLf & problems & vbCrLf & _
               "Картинки можно перетащить мышью или добавить имя во вкладке «Подпись и печать» программы.", _
               vbExclamation, MSG_TITLE
    End If
    Exit Sub

Fail:
    Application.ScreenUpdating = prevScreen
    MsgBox "Не удалось показать подписи: " & Err.Description, vbCritical, MSG_TITLE
End Sub

' =========================================================================
' STEP 2 - export all sheets to PDF
' =========================================================================
Public Sub SavePdfWithStamps()
    Dim wb As Workbook
    Set wb = GetWorkbook()
    If wb Is Nothing Then Exit Sub

    Dim n As Long
    n = CountOverlays(wb)
    If n = 0 Then
        Dim ans As VbMsgBoxResult
        ans = MsgBox("Подписи и печати ещё не показаны на листе." & vbCrLf & vbCrLf & _
                     "Да — показать их сейчас и проверить положение." & vbCrLf & _
                     "Нет — сохранить PDF без подписей.", vbYesNoCancel + vbQuestion, MSG_TITLE)
        If ans = vbYes Then
            ShowStampPreview
            Exit Sub
        ElseIf ans = vbCancel Then
            Exit Sub
        End If
    End If

    Dim cfg As Collection
    Set cfg = LoadConfig(True)

    Dim outside As String
    outside = ShapesOutsidePrintArea(wb)
    If Len(outside) > 0 Then
        If MsgBox("Эти картинки находятся вне области печати и не попадут в PDF:" & vbCrLf & vbCrLf & outside & _
                  vbCrLf & "Всё равно сохранить?", vbYesNo + vbExclamation, MSG_TITLE) = vbNo Then Exit Sub
    End If

    Dim openAfter As Boolean
    openAfter = (CfgGet(cfg, "General", "AutoOpenPdf", "1") = "1")

    Dim prevScreen As Boolean
    prevScreen = Application.ScreenUpdating
    Dim prevAlerts As Boolean
    prevAlerts = Application.DisplayAlerts
    Application.StatusBar = False
    Application.ScreenUpdating = False
    Application.DisplayAlerts = False

    Dim usedPath As String
    Dim ok As Boolean
    ok = ExportToFirstWorkingPath(wb, cfg, usedPath)

    Application.DisplayAlerts = prevAlerts
    Application.ScreenUpdating = prevScreen

    If ok Then
        RemoveOverlays wb
        RestoreSavedFlag wb
        Application.StatusBar = "PDF сохранён: " & usedPath
        If openAfter Then OpenFileDefault wb, usedPath
    Else
        Dim hint As String
        hint = ""
        If InStr(1, mLastError, "ExportAsFixedFormat", vbTextCompare) > 0 Or InStr(mLastError, "438") > 0 Then
            hint = vbCrLf & vbCrLf & "В Excel 2007 для сохранения в PDF нужна надстройка «Сохранить как PDF или XPS» от Microsoft."
        End If
        MsgBox "Не удалось сохранить PDF." & vbCrLf & vbCrLf & "Причина: " & mLastError & hint & vbCrLf & vbCrLf & _
               "Подписи на листе сохранены — можно нажать «Сохранить PDF» ещё раз.", vbCritical, MSG_TITLE
    End If
End Sub

' tries: beside the workbook, beside it with a time stamp (file open in a viewer),
' Documents, Desktop
Private Function ExportToFirstWorkingPath(wb As Workbook, cfg As Collection, ByRef usedPath As String) As Boolean
    Dim baseName As String
    baseName = wb.Name
    If InStrRev(baseName, ".") > 0 Then baseName = Left$(baseName, InStrRev(baseName, ".") - 1)
    baseName = CleanFileName(baseName)
    Dim suffix As String
    suffix = CfgGet(cfg, "General", "Suffix", "")

    Dim stamp As String
    stamp = " (" & Format(Now, "hhnnss") & ")"

    Dim cand As New Collection
    Dim folder As String
    folder = wb.Path
    Dim cloud As Boolean
    cloud = (Len(folder) = 0) Or (LCase$(Left$(folder, 4)) = "http")
    If Not cloud Then
        cand.Add folder & "\" & baseName & suffix & ".pdf"
        cand.Add folder & "\" & baseName & suffix & stamp & ".pdf"
    End If
    cand.Add ShellExpand("%USERPROFILE%") & "\Documents\" & baseName & suffix & ".pdf"
    cand.Add ShellExpand("%USERPROFILE%") & "\Desktop\" & baseName & suffix & stamp & ".pdf"

    Dim i As Long
    For i = 1 To cand.Count
        ' Excel limits the full path to about 255 characters
        If Len(cand(i)) <= 240 Then
            If TryExport(wb, CStr(cand(i))) Then
                usedPath = CStr(cand(i))
                ExportToFirstWorkingPath = True
                Exit Function
            End If
        End If
    Next i
End Function

Private Function TryExport(wb As Workbook, ByVal path As String) As Boolean
    On Error GoTo EH
    wb.ExportAsFixedFormat Type:=xlTypePDF, Filename:=path, Quality:=xlQualityStandard, _
        IncludeDocProperties:=True, IgnorePrintAreas:=False, OpenAfterPublish:=False
    TryExport = True
    Exit Function
EH:
    mLastError = Err.Description
    If Len(mLastError) = 0 Then mLastError = "ошибка " & Err.Number
    TryExport = False
End Function

Private Function CleanFileName(ByVal s As String) As String
    Dim bad As Variant, i As Long
    bad = Array("\", "/", ":", "*", "?", """", "<", ">", "|")
    For i = 0 To UBound(bad)
        s = Replace(s, bad(i), "_")
    Next i
    s = Trim$(s)
    If Len(s) = 0 Then s = "document"
    CleanFileName = s
End Function

Private Sub OpenFileDefault(wb As Workbook, ByVal path As String)
    On Error Resume Next
    wb.FollowHyperlink path
    If Err.Number <> 0 Then
        Err.Clear
        CreateObject("Shell.Application").ShellExecute path
    End If
    On Error GoTo 0
End Sub

' =========================================================================
' Remove pictures
' =========================================================================
Public Sub ClearStampPreview()
    Dim wb As Workbook
    Set wb = GetWorkbook()
    If wb Is Nothing Then Exit Sub
    RemoveOverlays wb
    RestoreSavedFlag wb
    Application.StatusBar = "Подписи и печати убраны с листа."
End Sub

Private Sub RemoveOverlays(wb As Workbook)
    Dim ws As Object
    Dim i As Long
    For Each ws In wb.Worksheets
        On Error Resume Next
        For i = ws.Shapes.Count To 1 Step -1
            If Left$(ws.Shapes(i).Name, Len(SHAPE_PREFIX)) = SHAPE_PREFIX Then ws.Shapes(i).Delete
        Next i
        On Error GoTo 0
    Next ws
End Sub

Private Function CountOverlays(wb As Workbook) As Long
    Dim ws As Object
    Dim i As Long
    Dim n As Long
    For Each ws In wb.Worksheets
        On Error Resume Next
        For i = 1 To ws.Shapes.Count
            If Left$(ws.Shapes(i).Name, Len(SHAPE_PREFIX)) = SHAPE_PREFIX Then n = n + 1
        Next i
        On Error GoTo 0
    Next ws
    CountOverlays = n
End Function

Private Function ShapesOutsidePrintArea(wb As Workbook) As String
    Dim ws As Object
    Dim shp As Shape
    Dim res As String
    For Each ws In wb.Worksheets
        On Error Resume Next
        Dim pa As String
        pa = ""
        pa = ws.PageSetup.PrintArea
        If Len(pa) > 0 Then
            Dim rng As Range
            Set rng = Nothing
            Set rng = ws.Range(pa)
            If Not rng Is Nothing Then
                For Each shp In ws.Shapes
                    If Left$(shp.Name, Len(SHAPE_PREFIX)) = SHAPE_PREFIX Then
                        If Application.Intersect(rng, shp.TopLeftCell) Is Nothing Or _
                           Application.Intersect(rng, shp.BottomRightCell) Is Nothing Then
                            res = res & "• лист «" & ws.Name & "»: " & shp.AlternativeText & vbCrLf
                        End If
                    End If
                Next shp
            End If
        End If
        On Error GoTo 0
    Next ws
    ShapesOutsidePrintArea = res
End Function

' keep the "workbook has unsaved changes" flag clean: our temporary pictures are not a change
Private Sub RememberSavedFlag(wb As Workbook, ByVal wasSaved As Boolean)
    If mSavedFlags Is Nothing Then Set mSavedFlags = New Collection
    If Not HasKey(mSavedFlags, wb.FullName) Then
        On Error Resume Next
        mSavedFlags.Add wasSaved, wb.FullName
        On Error GoTo 0
    End If
End Sub

Private Sub RestoreSavedFlag(wb As Workbook)
    If mSavedFlags Is Nothing Then Exit Sub
    If HasKey(mSavedFlags, wb.FullName) Then
        If CountOverlays(wb) = 0 Then
            On Error Resume Next
            wb.Saved = CBool(mSavedFlags(wb.FullName))
            mSavedFlags.Remove wb.FullName
            On Error GoTo 0
        End If
    End If
End Sub

' =========================================================================
' Finding the signer in the workbook
' =========================================================================
Private Function FindSigner(wb As Workbook, cfg As Collection, ByVal idx As Long, ByVal total As Long) As Candidate
    Dim sec As String
    sec = "Signer" & idx

    Dim names() As String
    Dim nameCount As Long
    Dim raw As String
    raw = CfgGet(cfg, sec, "Names", CfgGet(cfg, sec, "FullName", ""))
    Dim parts() As String
    parts = Split(raw, "|")
    ReDim names(0 To UBound(parts) + 1)
    Dim k As Long
    For k = 0 To UBound(parts)
        Dim nn As String
        nn = NormText(parts(k))
        If Len(nn) >= 4 Then
            names(nameCount) = nn
            nameCount = nameCount + 1
        End If
    Next k

    ' surname-only match is allowed only if no other signer has the same surname
    Dim surname As String
    surname = SurnameOf(CfgGet(cfg, sec, "FullName", ""))
    If Len(surname) >= 4 Then
        Dim j As Long
        For j = 1 To total
            If j <> idx Then
                If SurnameOf(CfgGet(cfg, "Signer" & j, "FullName", "")) = surname Then surname = ""
            End If
        Next j
    End If

    Dim roles() As String
    Dim roleCount As Long
    Dim rparts() As String
    rparts = Split(CfgGet(cfg, sec, "Roles", ""), "|")
    ReDim roles(0 To UBound(rparts) + 1)
    For k = 0 To UBound(rparts)
        Dim rr As String
        rr = NormText(rparts(k))
        If Len(rr) >= 4 Then
            roles(roleCount) = rr
            roleCount = roleCount + 1
        End If
    Next k

    Dim best As Candidate
    best.Found = False
    best.Score = -1

    Dim si As Long
    For si = 1 To wb.Worksheets.Count
        Dim ws As Worksheet
        Set ws = wb.Worksheets(si)
        If ws.Visible = xlSheetVisible Then
            ScanSheet ws, si, names, nameCount, surname, roles, roleCount, best
        End If
    Next si
    FindSigner = best
End Function

' reads the used range in blocks so huge or heavily formatted sheets cannot exhaust memory
Private Sub ScanSheet(ws As Worksheet, ByVal si As Long, names() As String, ByVal nameCount As Long, _
        ByVal surname As String, roles() As String, ByVal roleCount As Long, ByRef best As Candidate)
    Dim ur As Range
    On Error Resume Next
    Set ur = ws.UsedRange
    On Error GoTo 0
    If ur Is Nothing Then Exit Sub

    Dim nR As Long, nC As Long
    nR = ur.Rows.Count
    nC = ur.Columns.Count
    If nR < 1 Or nC < 1 Then Exit Sub

    Dim blockRows As Long
    blockRows = 1500000 \ nC
    If blockRows < 20 Then blockRows = 20
    If blockRows > 4000 Then blockRows = 4000

    Dim r0 As Long, r1 As Long
    For r0 = 1 To nR Step blockRows
        r1 = r0 + blockRows - 1
        If r1 > nR Then r1 = nR

        Dim vals As Variant
        Dim blk As Range
        Set blk = ur.Range(ur.Cells(r0, 1), ur.Cells(r1, nC))
        vals = blk.Value2
        If Not IsArray(vals) Then
            Dim one As Variant
            ReDim one(1 To 1, 1 To 1)
            one(1, 1) = vals
            vals = one
        End If

        Dim r As Long, c As Long
        For r = 1 To UBound(vals, 1)
            For c = 1 To UBound(vals, 2)
                If VarType(vals(r, c)) = vbString Then
                    Dim t As String
                    t = vals(r, c)
                    If Len(t) >= 4 And Len(t) <= 500 Then
                        Dim sc As Long
                        sc = ScoreCell(t, names, nameCount, surname, roles, roleCount, vals, r, c)
                        If sc >= 60 And sc >= best.Score Then
                            best.Found = True
                            best.Score = sc
                            best.SheetIndex = si
                            best.Row = ur.Row + (r0 - 1) + r - 1
                            best.Col = ur.Column + c - 1
                            best.Text = t
                        End If
                    End If
                End If
            Next c
        Next r
    Next r0
End Sub

Private Function ScoreCell(ByVal txt As String, names() As String, ByVal nameCount As Long, _
        ByVal surname As String, roles() As String, ByVal roleCount As Long, _
        vals As Variant, ByVal r As Long, ByVal c As Long) As Long
    Dim norm As String
    norm = NormText(txt)
    Dim score As Long
    Dim k As Long

    For k = 0 To nameCount - 1
        If InStr(norm, names(k)) > 0 Then score = 100: Exit For
    Next k
    If score = 0 And Len(surname) >= 4 Then
        If InStr(norm, surname) > 0 Then score = 60
    End If
    If score = 0 Then Exit Function

    For k = 0 To roleCount - 1
        If InStr(norm, roles(k)) > 0 Then score = score + 20: Exit For
    Next k

    If InStr(txt, "___") > 0 Then
        score = score + 30
    Else
        Dim cc As Long
        For cc = c - 4 To c + 4
            If cc >= 1 And cc <= UBound(vals, 2) And cc <> c Then
                If VarType(vals(r, cc)) = vbString Then
                    If InStr(vals(r, cc), "___") > 0 Then score = score + 20: Exit For
                End If
            End If
        Next cc
    End If
    If Len(txt) > 160 Then score = score - 40   ' a paragraph, not a signature line
    ScoreCell = score
End Function

Private Function SurnameOf(ByVal fullName As String) As String
    fullName = Trim$(fullName)
    If Len(fullName) = 0 Then Exit Function
    Dim p As Long
    p = InStr(fullName, " ")
    If p > 0 Then fullName = Left$(fullName, p - 1)
    SurnameOf = NormText(fullName)
End Function

' lower-case, yo->ye, Kazakh letters -> Russian, Latin look-alikes -> Cyrillic, drop spaces/dots/dashes/underscores
Private Function NormText(ByVal s As String) As String
    Dim i As Long, code As Long
    Dim sb As String
    s = LCase$(s)
    For i = 1 To Len(s)
        code = AscW(Mid$(s, i, 1))
        If code < 0 Then code = code + 65536
        Select Case code
            Case 32, 160, 9, 10, 13, 46, 44, 95, 45, 8208 To 8213, 40, 41, 58, 59, 8201, 8239
                ' skipped
            Case 1105: sb = sb & ChrW(1077)               ' yo -> ye
            Case 1241: sb = sb & ChrW(1072)               ' kk a-umlaut -> a
            Case 1110: sb = sb & ChrW(1080)               ' kk i -> i
            Case 1187: sb = sb & ChrW(1085)               ' kk n-hook -> n
            Case 1171: sb = sb & ChrW(1075)               ' kk g-stroke -> g
            Case 1199, 1201: sb = sb & ChrW(1091)         ' kk u -> u
            Case 1179: sb = sb & ChrW(1082)               ' kk k-descender -> k
            Case 1257: sb = sb & ChrW(1086)               ' kk o -> o
            Case 1211: sb = sb & ChrW(1093)               ' kk h -> h
            Case 97: sb = sb & ChrW(1072)                 ' latin a
            Case 99: sb = sb & ChrW(1089)                 ' latin c
            Case 101: sb = sb & ChrW(1077)                ' latin e
            Case 111: sb = sb & ChrW(1086)                ' latin o
            Case 112: sb = sb & ChrW(1088)                ' latin p
            Case 120: sb = sb & ChrW(1093)                ' latin x
            Case 121: sb = sb & ChrW(1091)                ' latin y
            Case 107: sb = sb & ChrW(1082)                ' latin k
            Case 109: sb = sb & ChrW(1084)                ' latin m
            Case Else: sb = sb & ChrW(code)
        End Select
    Next i
    NormText = sb
End Function

' =========================================================================
' Geometry: where the signature goes
' =========================================================================
Private Function PlaceSignature(ws As Worksheet, cand As Candidate, ByVal imgPath As String, _
        ByVal widthPt As Double, ByVal sId As String, ByVal label As String) As Shape
    Dim cx As Double, lineY As Double
    Dim found As Boolean
    found = UnderscoreCenter(ws, cand.Row, cand.Col, cx, lineY)

    If Not found Then
        ' underscores live in a neighbouring cell of the same row (name in its own cell)
        Dim d As Long, cc As Long
        For d = 1 To 4
            For cc = cand.Col - d To cand.Col + d Step 2 * d
                If cc >= 1 And cc <= ws.Columns.Count Then
                    If UnderscoreCenter(ws, cand.Row, cc, cx, lineY) Then found = True: Exit For
                End If
            Next cc
            If found Then Exit For
        Next d
    End If

    If Not found Then
        ' no line to sit on: put the signature just before the printed name
        Dim x0 As Double, lw As Double
        TextStart ws, cand.Row, cand.Col, cand.Text, x0, lw, lineY
        cx = x0 - widthPt * 0.55
        If cx < widthPt / 2 Then cx = x0 + widthPt * 0.5
    End If

    If widthPt < 20 Then widthPt = 110

    Dim shp As Shape
    On Error GoTo Fail
    Set shp = ws.Shapes.AddPicture(imgPath, msoFalse, msoTrue, 0, 0, -1, -1)
    shp.LockAspectRatio = msoTrue
    shp.Width = widthPt
    shp.Left = MaxD(0, cx - shp.Width / 2)
    shp.Top = MaxD(0, lineY - shp.Height * 0.78)
    shp.Name = SHAPE_PREFIX & "S_" & sId
    shp.AlternativeText = "Подпись: " & label
    shp.Placement = xlMove
    Set PlaceSignature = shp
    Exit Function
Fail:
    mLastError = Err.Description
    Set PlaceSignature = Nothing
End Function

Private Function PlaceStamp(owner As Shape, ByVal imgPath As String, ByVal sec As String, cfg As Collection, _
        ByVal manual As Boolean, ByVal label As String) As Shape
    Dim ws As Worksheet
    Set ws = owner.Parent

    Dim w As Double
    w = CDbl(Val(CfgGet(cfg, sec, "WidthPt", "112")))
    If w < 20 Then w = 112
    Dim ratio As Double
    ratio = CDbl(Val(CfgGet(cfg, sec, "OverlapRatio", "0.3")))
    If ratio < 0.1 Then ratio = 0.1
    If ratio > 0.6 Then ratio = 0.6
    Dim rotation As Double
    rotation = CDbl(Val(CfgGet(cfg, sec, "Rotation", "0")))
    Dim pos As String
    pos = UCase$(CfgGet(cfg, sec, "AnchorPosition", "AUTO"))
    Dim rel As String
    rel = UCase$(CfgGet(cfg, sec, "Relation", "OVERLAP"))
    If manual Then pos = "BESIDE_RIGHT"
    If pos = "AUTO" Or Len(pos) = 0 Then
        If rel = "BESIDE" Then pos = "BESIDE_LEFT" Else pos = "OVERLAP_LEFT"
    End If

    On Error GoTo Fail
    Dim shp As Shape
    Set shp = ws.Shapes.AddPicture(imgPath, msoFalse, msoTrue, 0, 0, -1, -1)
    shp.LockAspectRatio = msoTrue
    shp.Width = w
    Dim h As Double
    h = shp.Height

    Dim sx As Double, sy As Double, sw As Double, sh As Double
    sx = owner.Left: sy = owner.Top: sw = owner.Width: sh = owner.Height
    Dim x As Double, y As Double
    y = sy + sh / 2 - h / 2 + 4

    Select Case pos
        Case "OVERLAP_CENTER": x = sx + sw / 2 - w / 2
        Case "OVERLAP_RIGHT": x = sx + sw - w * ratio
        Case "BESIDE_LEFT": x = sx - w - 8: y = sy + sh / 2 - h / 2
        Case "BESIDE_RIGHT": x = sx + sw + 8: y = sy + sh / 2 - h / 2
        Case "BELOW": x = sx + sw / 2 - w / 2: y = sy + sh + 10
        Case Else: x = sx - w * (1 - ratio)           ' OVERLAP_LEFT
    End Select

    shp.Left = MaxD(0, x)
    shp.Top = MaxD(0, y)
    shp.Rotation = rotation
    shp.Name = SHAPE_PREFIX & "T_" & CfgGet(cfg, sec, "Id", sec)
    shp.AlternativeText = "Печать: " & label
    shp.Placement = xlMove
    shp.ZOrder msoBringToFront
    Set PlaceStamp = shp
    Exit Function
Fail:
    mLastError = Err.Description
    Set PlaceStamp = Nothing
End Function

Private Function MaxD(ByVal a As Double, ByVal b As Double) As Double
    If a > b Then MaxD = a Else MaxD = b
End Function

' centre of the longest run of "_" in a cell, in sheet points, plus the baseline y
Private Function UnderscoreCenter(ws As Worksheet, ByVal r As Long, ByVal c As Long, _
        ByRef cx As Double, ByRef lineY As Double) As Boolean
    Dim txt As String
    On Error Resume Next
    txt = CStr(ws.Cells(r, c).Value2)
    On Error GoTo 0
    If InStr(txt, "___") = 0 Then Exit Function

    Dim bestStart As Long, bestLen As Long
    Dim i As Long, runStart As Long, runLen As Long
    For i = 1 To Len(txt) + 1
        If i <= Len(txt) And Mid$(txt, i, 1) = "_" Then
            If runLen = 0 Then runStart = i
            runLen = runLen + 1
        Else
            If runLen > bestLen Then bestLen = runLen: bestStart = runStart
            runLen = 0
        End If
    Next i
    If bestLen < 3 Then Exit Function

    Dim x0 As Double, totalW As Double
    TextStart ws, r, c, txt, x0, totalW, lineY
    Dim fs As Double
    fs = FontSizeOf(ws.Cells(r, c))
    Dim before As Double, runW As Double
    before = EstWidth(Left$(txt, bestStart - 1), fs)
    runW = EstWidth(String$(bestLen, "_"), fs)
    cx = x0 + before + runW / 2
    UnderscoreCenter = True
End Function

' left edge of the text, its width and baseline for a cell (merged cells use the merged area)
Private Sub TextStart(ws As Worksheet, ByVal r As Long, ByVal c As Long, ByVal txt As String, _
        ByRef x0 As Double, ByRef totalW As Double, ByRef lineY As Double)
    Dim cel As Range
    Set cel = ws.Cells(r, c)
    Dim area As Range
    Set area = cel
    On Error Resume Next
    If cel.MergeCells Then Set area = cel.MergeArea
    On Error GoTo 0

    Dim fs As Double
    fs = FontSizeOf(cel)
    totalW = EstWidth(txt, fs)

    Dim ha As Long
    ha = cel.HorizontalAlignment
    Select Case ha
        Case xlCenter, 7   ' center, center across selection
            x0 = area.Left + (area.Width - totalW) / 2
        Case xlRight
            x0 = area.Left + area.Width - totalW - 2
        Case Else
            x0 = area.Left + 2 + cel.IndentLevel * 9
    End Select
    If x0 < area.Left Then x0 = area.Left + 2

    Dim va As Long
    va = cel.VerticalAlignment
    Select Case va
        Case xlTop
            lineY = area.Top + fs * 1.15
        Case xlCenter
            lineY = area.Top + area.Height / 2 + fs * 0.45
        Case Else
            lineY = area.Top + area.Height - 2
    End Select
End Sub

Private Function FontSizeOf(cel As Range) As Double
    On Error Resume Next
    FontSizeOf = CDbl(cel.Font.Size)
    If FontSizeOf < 4 Then FontSizeOf = 11
    On Error GoTo 0
End Function

' rough proportional-font width model (points); manual correction handles the rest
Private Function EstWidth(ByVal s As String, ByVal fs As Double) As Double
    Dim i As Long, code As Long
    Dim w As Double
    For i = 1 To Len(s)
        code = AscW(Mid$(s, i, 1))
        If code < 0 Then code = code + 65536
        Select Case code
            Case 95: w = w + 0.5
            Case 32, 160: w = w + 0.28
            Case 46, 44, 58, 59, 33: w = w + 0.27
            Case 45, 40, 41: w = w + 0.33
            Case 48 To 57: w = w + 0.55
            Case 1040 To 1071, 65 To 90: w = w + 0.66
            Case Else: w = w + 0.54
        End Select
    Next i
    EstWidth = w * fs
End Function

' =========================================================================
' Collections used instead of Scripting.Dictionary
' =========================================================================
Private Function HasKey(col As Collection, ByVal key As String) As Boolean
    On Error Resume Next
    Dim x As Variant
    x = IsObject(col(key))
    HasKey = (Err.Number = 0)
    Err.Clear
    On Error GoTo 0
End Function

Private Function CfgGet(cfg As Collection, ByVal section As String, ByVal key As String, ByVal def As String) As String
    CfgGet = def
    If cfg Is Nothing Then Exit Function
    Dim v As String
    On Error Resume Next
    v = cfg(section & "|" & key)
    If Err.Number = 0 Then CfgGet = v
    Err.Clear
    On Error GoTo 0
End Function

' =========================================================================
' Config / files (every optional COM object has a fallback)
' =========================================================================
Private Function GetWorkbook() As Workbook
    Dim wb As Workbook
    On Error Resume Next
    Set wb = ActiveWorkbook
    On Error GoTo 0
    If wb Is Nothing Then
        MsgBox "Нет открытого файла Excel." & vbCrLf & _
               "Если файл открыт в режиме защищённого просмотра, нажмите «Разрешить редактирование».", _
               vbExclamation, MSG_TITLE
    ElseIf wb.IsAddin Then
        MsgBox "Откройте протокол Excel и нажмите кнопку ещё раз.", vbExclamation, MSG_TITLE
        Set wb = Nothing
    End If
    Set GetWorkbook = wb
End Function

Private Function ShellExpand(ByVal s As String) As String
    On Error Resume Next
    ShellExpand = CreateObject("WScript.Shell").ExpandEnvironmentStrings(s)
    If Err.Number <> 0 Or Len(ShellExpand) = 0 Or InStr(ShellExpand, "%") > 0 Then
        Err.Clear
        ShellExpand = Environ(Replace(s, "%", ""))
    End If
    On Error GoTo 0
End Function

Private Function DataDir() As String
    DataDir = ShellExpand("%APPDATA%") & "\" & APP_FOLDER
End Function

Private Function FileExistsU(ByVal path As String) As Boolean
    On Error Resume Next
    FileExistsU = CreateObject("Scripting.FileSystemObject").FileExists(path)
    If Err.Number <> 0 Then
        Err.Clear
        FileExistsU = (Len(Dir(path)) > 0)
    End If
    On Error GoTo 0
End Function

Private Function AssetPath(ByVal fileName As String) As String
    If Len(fileName) = 0 Then Exit Function
    Dim p As String
    p = DataDir() & "\assets\" & fileName
    If FileExistsU(p) Then AssetPath = p
End Function

' UTF-16 text through FileSystemObject (handles non-ANSI user names)
Private Function ReadTextUtf16(ByVal path As String) As String
    On Error GoTo EH
    Dim ts As Object
    Set ts = CreateObject("Scripting.FileSystemObject").OpenTextFile(path, 1, False, -1)
    ReadTextUtf16 = ts.ReadAll
    ts.Close
    Exit Function
EH:
    ReadTextUtf16 = ""
End Function

Private Function ReadTextUtf8(ByVal path As String) As String
    On Error GoTo EH
    Dim st As Object
    Set st = CreateObject("ADODB.Stream")
    st.Type = 2
    st.Charset = "utf-8"
    st.Open
    st.LoadFromFile path
    ReadTextUtf8 = st.ReadText
    st.Close
    Exit Function
EH:
    ReadTextUtf8 = ""
End Function

Private Function LoadConfig(Optional ByVal silent As Boolean = False) As Collection
    Dim dir16 As String, dir8 As String
    dir16 = DataDir() & "\config16.ini"
    dir8 = DataDir() & "\config.ini"

    Dim txt As String
    If FileExistsU(dir16) Then txt = ReadTextUtf16(dir16)
    If Len(txt) = 0 And FileExistsU(dir8) Then txt = ReadTextUtf8(dir8)

    If Len(txt) = 0 Then
        If Not silent Then
            MsgBox "Настройки не найдены." & vbCrLf & vbCrLf & _
                   "Откройте программу «PDF Stamp Studio», добавьте подписи и печати на вкладке «Подпись и печать» — " & _
                   "они появятся здесь автоматически.", vbInformation, MSG_TITLE
        End If
        Exit Function
    End If

    Dim d As New Collection
    Dim lines() As String
    lines = Split(Replace(txt, vbCr, ""), vbLf)
    Dim i As Long, section As String, ln As String, p As Long
    For i = 0 To UBound(lines)
        ln = Trim$(lines(i))
        If Len(ln) > 0 Then
            If AscW(Left$(ln, 1)) = &HFEFF Then ln = Mid$(ln, 2)
            If Left$(ln, 1) = "[" And Right$(ln, 1) = "]" Then
                section = Mid$(ln, 2, Len(ln) - 2)
            ElseIf Left$(ln, 1) <> ";" Then
                p = InStr(ln, "=")
                If p > 1 Then
                    On Error Resume Next
                    d.Add Trim$(Mid$(ln, p + 1)), section & "|" & Trim$(Left$(ln, p - 1))
                    On Error GoTo 0
                End If
            End If
        End If
    Next i
    Set LoadConfig = d
End Function

Private Function EnsureEditable(ws As Worksheet) As Boolean
    On Error Resume Next
    If ws.ProtectDrawingObjects Or ws.ProtectContents Then ws.Unprotect ""
    EnsureEditable = Not (ws.ProtectDrawingObjects Or ws.ProtectContents)
    On Error GoTo 0
End Function

Public Sub OpenSettingsApp()
    Dim cfg As Collection
    Set cfg = LoadConfig(True)
    Dim exe As String
    exe = CfgGet(cfg, "General", "AppPath", "")
    If Len(exe) = 0 Or Not FileExistsU(exe) Then
        MsgBox "Программу «PDF Stamp Studio» не удалось найти. Запустите её с рабочего стола или из меню «Пуск».", _
               vbInformation, MSG_TITLE
        Exit Sub
    End If
    On Error Resume Next
    CreateObject("WScript.Shell").Run """" & exe & """", 1, False
    If Err.Number <> 0 Then
        Err.Clear
        Shell """" & exe & """", vbNormalFocus
    End If
    On Error GoTo 0
End Sub
