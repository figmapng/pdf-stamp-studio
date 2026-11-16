Attribute VB_Name = "PdfStampModule"
Option Explicit

' =========================================================================
' PDF Stamp Studio — Excel Add-in Engine
' Барлық құжатты бір PDF қылып экспорттау, қолтаңбалар мен мөрді автоматты қою
' =========================================================================

Private Const TOOLBAR_NAME As String = "PdfStampStudioToolbar"
Private Const APP_FOLDER As String = "PdfStampStudio"

' Excel ашылғанда автоматты түрде мәзірді/батырманы қосу
Public Sub Auto_Open()
    On Error Resume Next
    SetupToolbar
    ' Ыңғайлы пернелер тіркесімі: Ctrl + Shift + P
    Application.OnKey "+^P", "RunPdfStampStudio"
    On Error GoTo 0
End Sub

Public Sub Auto_Close()
    On Error Resume Next
    RemoveToolbar
    Application.OnKey "+^P"
    On Error GoTo 0
End Sub

' Excel мәзіріне тұрақты батырма қосу
Public Sub SetupToolbar()
    On Error Resume Next
    RemoveToolbar
    
    Dim cb As CommandBar
    Set cb = Application.CommandBars.Add(Name:=TOOLBAR_NAME, Position:=msoBarTop, Temporary:=False)
    cb.Visible = True
    
    Dim btn As CommandBarButton
    Set btn = cb.Controls.Add(Type:=msoControlButton)
    With btn
        .Caption = "PDF жасау және қол қою"
        .Style = msoButtonIconAndCaption
        .FaceId = 280 ' PDF / Printer белгішесі
        .OnAction = "RunPdfStampStudio"
        .TooltipText = "Хаттаманы бір тұтас PDF қылып экспорттау және қолтаңбалар мен мөрді қою (Ctrl+Shift+P)"
    End With
    On Error GoTo 0
End Sub

Public Sub RemoveToolbar()
    On Error Resume Next
    Dim cb As CommandBar
    Set cb = Application.CommandBars(TOOLBAR_NAME)
    If Not cb Is Nothing Then cb.Delete
    On Error GoTo 0
End Sub

' Басты орындалатын процедура
Public Sub RunPdfStampStudio()
    Dim wb As Workbook
    Set wb = ActiveWorkbook
    
    If wb Is Nothing Then
        MsgBox "Ашық тұрған Excel файлы табылмады!", vbExclamation, "PDF Stamp Studio"
        Exit Sub
    End If
    
    Dim appDataDir As String
    appDataDir = Environ("APPDATA") & Application.PathSeparator & APP_FOLDER & Application.PathSeparator
    Dim iniPath As String
    iniPath = appDataDir & "config.ini"
    
    If Dir(iniPath) = "" Then
        MsgBox "Баптау файлы табылмады!" & vbCrLf & vbCrLf & _
               "Алдымен 'PDF Stamp Studio Баптау' бағдарламасын ашып, қол қоюшылар мен мөрді сақтаңыз." & vbCrLf & _
               "Жол: " & iniPath, vbCritical, "PDF Stamp Studio — Баптау қажет"
        Exit Sub
    End If
    
    Application.ScreenUpdating = False
    Application.DisplayAlerts = False
    
    ' Уақытша қойылған фигураларды есте сақтау жинағы
    Dim addedShapes As Collection
    Set addedShapes = New Collection
    
    ' 1. Signer 1 баптауларын оқу және қою
    Call ProcessSigner(wb, iniPath, "Signer1", appDataDir, addedShapes)
    
    ' 2. Signer 2 баптауларын оқу және қою
    Call ProcessSigner(wb, iniPath, "Signer2", appDataDir, addedShapes)
    
    ' 3. Мөрді оқу және қою
    Call ProcessStamp(wb, iniPath, "Stamp", appDataDir, addedShapes)
    
    ' 4. Шығатын PDF файлының атауын анықтау
    Dim pdfPath As String
    Dim baseFolder As String
    Dim baseName As String
    
    If Len(wb.Path) > 0 Then
        baseFolder = wb.Path & Application.PathSeparator
    Else
        baseFolder = Environ("USERPROFILE") & Application.PathSeparator & "Desktop" & Application.PathSeparator
    End If
    
    If InStrRev(wb.Name, ".") > 0 Then
        baseName = Left(wb.Name, InStrRev(wb.Name, ".") - 1)
    Else
        baseName = wb.Name
    End If
    
    Dim suffix As String
    suffix = ReadIniValue(iniPath, "General", "Suffix", "_қол_қойылған")
    pdfPath = baseFolder & baseName & suffix & ".pdf"
    
    ' 5. Бүкіл көрінетін парақтарды бір PDF қылып экспорттау
    Dim exportSuccess As Boolean
    exportSuccess = False
    
    On Error Resume Next
    wb.ExportAsFixedFormat _
        Type:=xlTypePDF, _
        Filename:=pdfPath, _
        Quality:=xlQualityStandard, _
        IncludeDocProperties:=True, _
        IgnorePrintAreas:=False, _
        OpenAfterPublish:=True
        
    If Err.Number = 0 Then
        exportSuccess = True
    Else
        MsgBox "PDF сақтау кезінде қате шықты:" & vbCrLf & Err.Description, vbCritical, "PDF Stamp Studio"
    End If
    On Error GoTo 0
    
    ' 6. Excel парағын тазалау (уақытша қойылған қолдар мен мөрлерді өшіру)
    Dim shp As Shape
    For Each shp In addedShapes
        On Error Resume Next
        shp.Delete
        On Error GoTo 0
    Next shp
    
    Application.ScreenUpdating = True
    Application.DisplayAlerts = True
    
    If exportSuccess Then
        Application.StatusBar = "PDF сәтті дайындалды: " & pdfPath
    End If
End Sub

Private Sub ProcessSigner(ByRef wb As Workbook, ByVal iniPath As String, ByVal section As String, ByVal appDataDir As String, ByRef addedShapes As Collection)
    Dim enabled As String
    enabled = ReadIniValue(iniPath, section, "Enabled", "1")
    If enabled <> "1" Then Exit Sub
    
    Dim keywordsRaw As String
    keywordsRaw = ReadIniValue(iniPath, section, "Keywords", "")
    If Len(keywordsRaw) = 0 Then Exit Sub
    
    Dim imgName As String
    imgName = ReadIniValue(iniPath, section, "ImageFile", "")
    Dim imgPath As String
    imgPath = appDataDir & "signatures" & Application.PathSeparator & imgName
    If Dir(imgPath) = "" Then
        ' Fallback: тікелей appDataDir ішінен іздеу
        imgPath = appDataDir & imgName
        If Dir(imgPath) = "" Then Exit Sub
    End If
    
    Dim offX As Double, offY As Double, w As Double, h As Double
    offX = CDbl(Val(ReadIniValue(iniPath, section, "OffsetX", "70")))
    offY = CDbl(Val(ReadIniValue(iniPath, section, "OffsetY", "-12")))
    w = CDbl(Val(ReadIniValue(iniPath, section, "Width", "110")))
    h = CDbl(Val(ReadIniValue(iniPath, section, "Height", "42")))
    
    Dim targetCell As Range
    Set targetCell = FindCellByKeywords(wb, keywordsRaw)
    
    If Not targetCell Is Nothing Then
        Dim ws As Worksheet
        Set ws = targetCell.Worksheet
        Dim pic As Shape
        Set pic = ws.Shapes.AddPicture(imgPath, msoFalse, msoTrue, _
                    targetCell.Left + offX, targetCell.Top + offY, w, h)
        addedShapes.Add pic
    End If
End Sub

Private Sub ProcessStamp(ByRef wb As Workbook, ByVal iniPath As String, ByVal section As String, ByVal appDataDir As String, ByRef addedShapes As Collection)
    Dim enabled As String
    enabled = ReadIniValue(iniPath, section, "Enabled", "1")
    If enabled <> "1" Then Exit Sub
    
    Dim anchorRaw As String
    anchorRaw = ReadIniValue(iniPath, section, "AnchorName", "")
    If Len(anchorRaw) = 0 Then Exit Sub
    
    Dim imgName As String
    imgName = ReadIniValue(iniPath, section, "ImageFile", "")
    Dim imgPath As String
    imgPath = appDataDir & "stamps" & Application.PathSeparator & imgName
    If Dir(imgPath) = "" Then
        imgPath = appDataDir & imgName
        If Dir(imgPath) = "" Then Exit Sub
    End If
    
    Dim offX As Double, offY As Double, w As Double, h As Double
    offX = CDbl(Val(ReadIniValue(iniPath, section, "OffsetX", "40")))
    offY = CDbl(Val(ReadIniValue(iniPath, section, "OffsetY", "-32")))
    w = CDbl(Val(ReadIniValue(iniPath, section, "Width", "95")))
    h = CDbl(Val(ReadIniValue(iniPath, section, "Height", "95")))
    
    Dim targetCell As Range
    Set targetCell = FindCellByKeywords(wb, anchorRaw)
    
    If Not targetCell Is Nothing Then
        Dim ws As Worksheet
        Set ws = targetCell.Worksheet
        Dim pic As Shape
        Set pic = ws.Shapes.AddPicture(imgPath, msoFalse, msoTrue, _
                    targetCell.Left + offX, targetCell.Top + offY, w, h)
        addedShapes.Add pic
    End If
End Sub

Private Function FindCellByKeywords(ByRef wb As Workbook, ByVal keywordsCsv As String) As Range
    Dim keywords() As String
    keywords = Split(keywordsCsv, ",")
    
    Dim i As Long, k As Long
    Dim ws As Worksheet
    Dim found As Range
    
    ' Парақтарды соңынан басына қарай қарастырамыз (қол қоюшылар әдетте соңғы бетте болады)
    For i = wb.Worksheets.Count To 1 Step -1
        Set ws = wb.Worksheets(i)
        If ws.Visible = xlSheetVisible Then
            For k = LBound(keywords) To UBound(keywords)
                Dim kw As String
                kw = Trim$(keywords(k))
                If Len(kw) > 0 Then
                    Set found = ws.Cells.Find(What:=kw, LookIn:=xlValues, LookAt:=xlPart, MatchCase:=False)
                    If Not found Is Nothing Then
                        Set FindCellByKeywords = found
                        Exit Function
                    End If
                End If
            Next k
        End If
    Next i
    
    Set FindCellByKeywords = Nothing
End Function

' 32-bit және 64-bit Office үшін тәуелсіз таза INI оқу функциясы
Public Function ReadIniValue(ByVal filePath As String, ByVal section As String, ByVal key As String, Optional ByVal defaultValue As String = "") As String
    ReadIniValue = defaultValue
    If Dir(filePath) = "" Then Exit Function
    
    Dim fileNum As Integer
    fileNum = FreeFile
    Open filePath For Input As #fileNum
    
    Dim inTargetSection As Boolean
    inTargetSection = False
    
    Dim sSecTarget As String
    sSecTarget = "[" & LCase$(Trim$(section)) & "]"
    
    Dim lineStr As String
    Do While Not EOF(fileNum)
        Line Input #fileNum, lineStr
        lineStr = Trim$(lineStr)
        
        If Left$(lineStr, 1) = "[" And Right$(lineStr, 1) = "]" Then
            If LCase$(lineStr) = sSecTarget Then
                inTargetSection = True
            Else
                inTargetSection = False
            End If
        ElseIf inTargetSection And InStr(lineStr, "=") > 0 Then
            Dim eqPos As Long
            eqPos = InStr(lineStr, "=")
            Dim k As String
            k = Trim$(Left$(lineStr, eqPos - 1))
            If LCase$(k) = LCase$(key) Then
                ReadIniValue = Trim$(Mid$(lineStr, eqPos + 1))
                Close #fileNum
                Exit Function
            End If
        End If
    Loop
    
    Close #fileNum
End Function
