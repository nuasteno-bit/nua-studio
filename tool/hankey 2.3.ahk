; HanKey v1.3 - 3개 탭 버전 (화자 관리, 상용구 관리, 대본 송출)
; AutoHotkey v2.0 필요

#SingleInstance Force
#Requires AutoHotkey v2.0
Persistent

; ############################################
; #           VS Code 색상 테마              #
; ############################################
global VSColors := {
    bg: 0x1e1e1e,
    bgSecondary: 0x252526,
    bgTertiary: 0x2d2d30,
    border: 0x464647,
    text: 0xcccccc,
    textSecondary: 0x969696,
    accent: 0x007acc,
    buttonBg: 0x0e639c,
    buttonHover: 0x1177bb,
    success: 0x4ec9b0,
    warning: 0xce9178,
    error: 0xf48771,
    selection: 0x264f78
}

; ############################################
; #           전역 변수                      #
; ############################################
global speakers := []
global phrases := Map()
global triggerKey := "F3"
global registerKey := "F10"
global deleteWordKey := "F4"
global mainGui := ""
global speakerListView := ""
global phraseListView := ""
global selectedSpeakerIndex := 0
global isCapturingKey := false
global captureTarget := ""
global settingsFile := A_ScriptDir . "\StenoHelper_Settings.ini"
global triggerKeyText := ""
global registerKeyText := ""
global deleteWordKeyText := ""
global chkShowTooltips := ""
global phraseInput := ""
global speakerQuickInput := ""
global insert_pressed_time := 0
global comboThreshold := 3000  
global debugMode := false
global isF4Processing := false
global tabControl := ""

; 팝업창 관련 전역 변수
global speakerPopupGui := ""
global speakerPopupListView := ""
global speakerPopupStatus := ""
global phrasePopupGui := ""
global phrasePopupListView := ""
global phrasePopupStatus := ""

; 화자 형식 설정
global speakerPrefix := "-"
global speakerSuffix := ": "
global speakerAutoNewline := true
global edtPrefix := ""
global edtSuffix := ""
global chkAutoNewline := ""
global lblFormatPreview := ""
global phrasePreview := ""
global btnInsertTab := ""

; 대본 송출 관련 전역 변수
global scriptLines := []
global currentLineIndex := 1
global scriptMode := false
global scriptListView := ""
global lblScriptStatus := ""
global splitMethodDDL := ""
global customCharInput := ""
global chkPunctuation := ""
global chkScriptAutoNewline := ""
global scriptAutoNewline := true
global hiddenEdit := ""
global editingLineIndex := 0
global scriptPopupGui := ""
global scriptPopupListView := ""
global scriptPopupStatus := ""
global scriptSearchInput := ""
global scriptSearchResults := []
global currentSearchIndex := 0

; 팝업창 전용 검색 변수
global scriptPopupSearchInput := ""
global scriptPopupSearchBtn := ""
global scriptPopupSearchPrev := ""
global scriptPopupSearchNext := ""
global scriptPopupSearchResults := []
global currentPopupSearchIndex := 0

; 상태바 관련 변수
global statusBar := ""
global statusDot := ""
global statusText := ""
global speakerCountText := ""
global phraseCountText := ""

; ############################################
; #           초기화                         #
; ############################################
LoadSettings()
CreateMainGui()
SetupHotkeys()

; ############################################
; #       Insert 조합키 핫키 설정            #
; ############################################
Insert::
NumpadIns:: {
    global insert_pressed_time
    insert_pressed_time := A_TickCount
    ShowModernTooltip("Insert 감지!", 300)
    
    SetTimer(ResetInsertTime, -comboThreshold)
    return
}

WasInsertPressedRecently() {
    global insert_pressed_time, comboThreshold
    if (!GetKeyState("Insert", "P") && insert_pressed_time > 0 && (A_TickCount - insert_pressed_time < comboThreshold)) {
        return true
    }
    return false
}

ResetInsertTime() {
    global insert_pressed_time := 0
}

IsNumber(str) {
    if (str = "") {
        return false
    }
    Loop Parse, str {
        if (A_LoopField < "0" || A_LoopField > "9") {
            return false
        }
    }
    return true
}

#HotIf WasInsertPressedRecently()

$1:: {
    Send("{F13}")
    global insert_pressed_time := 0
    ShowModernTooltip("1→F13 변환!", 500)
}

$2:: {
    Send("{F14}")
    global insert_pressed_time := 0
}

$3:: {
    Send("{F15}")
    global insert_pressed_time := 0
}

$4:: {
    Send("{F16}")
    global insert_pressed_time := 0
}

$5:: {
    Send("{F17}")
    global insert_pressed_time := 0
}

$6:: {
    Send("{F18}")
    global insert_pressed_time := 0
}

$7:: {
    Send("{F19}")
    global insert_pressed_time := 0
}

$8:: {
    Send("{F20}")
    global insert_pressed_time := 0
}

$9:: {
    Send("{F21}")
    global insert_pressed_time := 0
}

#HotIf

#HotIf WasInsertPressedRecently() && !WinActive("ahk_id " . mainGui.Hwnd)
Delete::
NumpadDel::
End::
NumpadEnd::
Numpad1::
Down::
NumpadDown::
Numpad2::
PgDn::
NumpadPgDn::
Numpad3:: {
    ShowModernTooltip("주변키 차단됨", 200)
    return
}
#HotIf

; ############################################
; #       WM_KEYDOWN 메시지 처리             #
; ############################################
WM_KEYDOWN(wParam, lParam, msg, hwnd) {
    if (wParam = 13) {
        if (WinActive("ahk_id " . mainGui.Hwnd)) {
            try {
                focused := mainGui.FocusedCtrl
                
                if (focused = phraseInput) {
                    AddPhrase()
                    return 0
                }
                
                if (focused = speakerQuickInput) {
                    QuickAddSpeakerFromInput()
                    return 0
                }
            }
        }
    }
    return
}

; ############################################
; #           GUI 생성 (VS Code 스타일)      #
; ############################################
CreateMainGUI() {
    global mainGui := Gui("+Resize", "HanKey")
    mainGui.BackColor := Format("{:06X}", VSColors.bg)
    
    ; ===== VS Code 스타일 다크 타이틀바 적용 =====
    try {
        iconFile := A_ScriptDir . "\HanKey.ico"
        if (FileExist(iconFile)) {
            mainGui.SetIcon(iconFile)
        } else {
            mainGui.SetIcon("imageres.dll", 174)  ; 키보드 아이콘
        }
    } catch {
        ; 아이콘 설정 실패시 무시
    }
    
    ; Windows 10/11 다크 타이틀바 적용 함수
    ApplyDarkTitleBar(hwnd) {
        try {
            osVersion := StrSplit(A_OSVersion, ".")
            if (osVersion.Length >= 3) {
                majorVer := Integer(osVersion[1])
                minorVer := Integer(osVersion[2]) 
                buildVer := Integer(osVersion[3])
                
                if (majorVer >= 10 && buildVer >= 17763) {
                    DllCall("dwmapi\DwmSetWindowAttribute",
                            "Ptr", hwnd,
                            "UInt", 20,
                            "Int*", 1,
                            "UInt", 4)
                }
                
                if (majorVer >= 10 && buildVer >= 22000) {
                    titleColor := 0x1E1E1E
                    DllCall("dwmapi\DwmSetWindowAttribute",
                            "Ptr", hwnd,
                            "UInt", 35,
                            "UInt*", titleColor,
                            "UInt", 4)
                    
                    textColor := 0xFFFFFF
                    DllCall("dwmapi\DwmSetWindowAttribute",
                            "Ptr", hwnd,
                            "UInt", 36,
                            "UInt*", textColor,
                            "UInt", 4)
                }
            }
        } catch {
            ; DLL 호출 실패시 무시
        }
    }
    
    ; 탭 컨트롤 - 3개 탭만 유지
    global tabControl := mainGui.AddTab3("x0 y0 w800 h500", ["화자 관리", "상용구 관리", "대본 송출"])
    tabControl.SetFont("s10 c" . Format("{:06X}", VSColors.text), "Segoe UI")
    
    ; ===== 화자 관리 탭 =====
    tabControl.UseTab(1)
    
    sectionHeader := mainGui.AddText("x20 y40 w760 h30 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text) . " 0x200", " 화자 관리")
    sectionHeader.SetFont("s11 Bold", "Segoe UI")
    
    formatPanel := mainGui.AddText("x20 y75 w760 h85 Background" . Format("{:06X}", VSColors.bgSecondary), "")
    
    mainGui.AddText("x35 y85 w60 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text), "접두사:")
    mainGui.SetFont("s9", "Segoe UI")
    global edtPrefix := mainGui.AddEdit("x100 y83 w70 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), speakerPrefix)
    edtPrefix.SetFont("s9", "Consolas")
    edtPrefix.OnEvent("Change", (*) => UpdateSpeakerFormat())
    
    mainGui.AddText("x180 y85 w60 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text), "접미사:")
    global edtSuffix := mainGui.AddEdit("x245 y83 w70 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), speakerSuffix)
    edtSuffix.SetFont("s9", "Consolas")
    edtSuffix.OnEvent("Change", (*) => UpdateSpeakerFormat())
    
    global btnInsertTab := CreateVSButton(mainGui, 320, 82, 35, 26, "TAB")
    btnInsertTab.OnEvent("Click", InsertTabToSuffix)
    btnInsertTab.SetFont("s8", "Consolas")
    
    mainGui.AddText("x365 y85 w70 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text), "미리보기:")
    global lblFormatPreview := mainGui.AddText("x440 y83 w165 h24 Center 0x200 Border Background" . Format("{:06X}", VSColors.selection) . " c" . Format("{:06X}", VSColors.accent), "")
    lblFormatPreview.SetFont("s10 Bold", "Consolas")
    UpdateFormatPreview()
    
    global chkAutoNewline := mainGui.AddCheckbox("x35 y115 w300 c" . Format("{:06X}", VSColors.text), "자동 줄바꿈 (화자명 앞에 줄바꿈 추가)")
    chkAutoNewline.SetFont("s9", "Segoe UI")
    chkAutoNewline.Value := speakerAutoNewline
    chkAutoNewline.OnEvent("Click", (*) => UpdateSpeakerFormat())
    
    presetY := 170
    btnFormat1 := CreateVSButton(mainGui, 20, presetY, 90, 28, "-화자: ")
    btnFormat1.OnEvent("Click", (*) => SetSpeakerFormat("-", ": ", true))
    
    btnFormat2 := CreateVSButton(mainGui, 120, presetY, 90, 28, "[화자]")
    btnFormat2.OnEvent("Click", (*) => SetSpeakerFormat("[", "]", true))
    
    btnFormat3 := CreateVSButton(mainGui, 220, presetY, 90, 28, "-(화자)")
    btnFormat3.OnEvent("Click", (*) => SetSpeakerFormat("-(", ")", true))
    
    btnFormat4 := CreateVSButton(mainGui, 320, presetY, 90, 28, "[화자]→탭")
    btnFormat4.OnEvent("Click", (*) => SetSpeakerFormat("[", "]`t", true))
    
    f8Info := mainGui.AddText("x420 y" . (presetY + 5) . " w350 c" . Format("{:06X}", VSColors.warning), "F8: 커서 앞 단어를 화자로 빠르게 등록 (최대 9명)")
    f8Info.SetFont("s9", "Segoe UI")
    
    addY := 210
    mainGui.AddText("x20 y" . (addY + 6) . " w90 c" . Format("{:06X}", VSColors.text), "화자 빠른 추가:")
    mainGui.SetFont("s9", "Segoe UI")
    global speakerQuickInput := mainGui.AddEdit("x115 y" . (addY + 2) . " w320 h26 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), "")
    speakerQuickInput.SetFont("s9", "Segoe UI")
    speakerQuickInput.OnEvent("Focus", (*) => speakerQuickInput.Text := "")
    
    OnMessage(0x100, WM_KEYDOWN)
    
    btnQuickAdd := CreateVSButton(mainGui, 445, addY, 60, 26, "추가")
    btnQuickAdd.OnEvent("Click", QuickAddSpeakerFromInput)
    
    mainGui.AddText("x520 y" . (addY + 6) . " w260 c" . Format("{:06X}", VSColors.textSecondary), "(이름 입력 후 Enter 또는 추가 버튼)")
    mainGui.SetFont("s8", "Segoe UI")
    
    speakerLabel := mainGui.AddText("x20 y245 w200 c" . Format("{:06X}", VSColors.text), "화자 목록:")
    speakerLabel.SetFont("s10 Bold", "Segoe UI")
    
    btnSpeakerPopup := CreateVSButton(mainGui, 700, 243, 80, 24, "별도창 ↗")
    btnSpeakerPopup.OnEvent("Click", ShowSpeakerPopup)
    
    global speakerListView := mainGui.AddListView("x20 y270 w760 h140 Background" . Format("{:06X}", VSColors.bgTertiary) . " c" . Format("{:06X}", VSColors.text) . " -Theme +LV0x10000", ["번호", "이름", "단축키", "형식 예시"])
    speakerListView.SetFont("s9", "Segoe UI")
    speakerListView.ModifyCol(1, 60)
    speakerListView.ModifyCol(2, 200)
    speakerListView.ModifyCol(3, 150)
    speakerListView.ModifyCol(4, 320)
    speakerListView.OnEvent("DoubleClick", EditSpeaker)
    
    btnY := 420
    btnAddSpeaker := CreateVSButton(mainGui, 20, btnY, 80, 26, "화자 추가")
    btnAddSpeaker.OnEvent("Click", AddSpeaker)
    
    btnEditSpeaker := CreateVSButton(mainGui, 110, btnY, 80, 26, "수정")
    btnEditSpeaker.OnEvent("Click", EditSpeaker)
    
    btnDeleteSpeaker := CreateVSButton(mainGui, 200, btnY, 80, 26, "삭제")
    btnDeleteSpeaker.OnEvent("Click", DeleteSpeaker)
    
    btnMoveUp := CreateVSButton(mainGui, 290, btnY, 80, 26, "위로")
    btnMoveUp.OnEvent("Click", MoveSpeakerUp)
    
    btnMoveDown := CreateVSButton(mainGui, 380, btnY, 80, 26, "아래로")
    btnMoveDown.OnEvent("Click", MoveSpeakerDown)
    
    btnClearSpeakers := CreateVSButton(mainGui, 680, btnY, 100, 26, "모두 삭제", false, true)
    btnClearSpeakers.OnEvent("Click", ClearAllSpeakers)
    
    ; ===== 상용구 관리 탭 =====
    tabControl.UseTab(2)
    
    phraseHeader := mainGui.AddText("x20 y40 w760 h30 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text) . " 0x200", " 상용구 관리")
    phraseHeader.SetFont("s11 Bold", "Segoe UI")
    
    hotkeyPanel := mainGui.AddText("x20 y75 w760 h120 Background" . Format("{:06X}", VSColors.bgSecondary), "")
    
    mainGui.AddText("x35 y90 w60 c" . Format("{:06X}", VSColors.text) . " Background" . Format("{:06X}", VSColors.bgSecondary), "발동키:")
    mainGui.SetFont("s9", "Segoe UI")
    global triggerKeyText := mainGui.AddText("x100 y87 w80 h26 Center 0x200 Border Background" . Format("{:06X}", VSColors.selection) . " c" . Format("{:06X}", VSColors.accent), triggerKey)
    triggerKeyText.SetFont("s10 Bold", "Consolas")
    btnChangeTrigger := CreateVSButton(mainGui, 190, 86, 55, 28, "변경")
    btnChangeTrigger.OnEvent("Click", (*) => CaptureKey("trigger"))
    
    mainGui.AddText("x260 y90 w500 c" . Format("{:06X}", VSColors.text) . " Background" . Format("{:06X}", VSColors.bgSecondary), "커서 앞 단어를 상용구로 변환")
    
    mainGui.AddText("x35 y125 w60 c" . Format("{:06X}", VSColors.text) . " Background" . Format("{:06X}", VSColors.bgSecondary), "등록키:")
    global registerKeyText := mainGui.AddText("x100 y122 w80 h26 Center 0x200 Border Background" . Format("{:06X}", VSColors.selection) . " c" . Format("{:06X}", VSColors.accent), registerKey)
    registerKeyText.SetFont("s10 Bold", "Consolas")
    btnChangeRegister := CreateVSButton(mainGui, 190, 121, 55, 28, "변경")
    btnChangeRegister.OnEvent("Click", (*) => CaptureKey("register"))
    
    mainGui.AddText("x260 y125 w500 c" . Format("{:06X}", VSColors.text) . " Background" . Format("{:06X}", VSColors.bgSecondary), "에디터에서 상용구 등록")
    
    mainGui.AddText("x35 y160 w60 c" . Format("{:06X}", VSColors.text) . " Background" . Format("{:06X}", VSColors.bgSecondary), "단어삭제:")
    global deleteWordKeyText := mainGui.AddText("x100 y157 w80 h26 Center 0x200 Border Background" . Format("{:06X}", VSColors.selection) . " c" . Format("{:06X}", VSColors.accent), deleteWordKey)
    deleteWordKeyText.SetFont("s10 Bold", "Consolas")
    btnChangeDeleteWord := CreateVSButton(mainGui, 190, 156, 55, 28, "변경")
    btnChangeDeleteWord.OnEvent("Click", (*) => CaptureKey("deleteWord"))
    
    mainGui.AddText("x260 y160 w500 c" . Format("{:06X}", VSColors.text) . " Background" . Format("{:06X}", VSColors.bgSecondary), "단어 단위로 지우기")
    
    btnResetHotkeys := CreateVSButton(mainGui, 700, 156, 70, 28, "초기화")
    btnResetHotkeys.OnEvent("Click", ResetHotkeys)
    
    ; 상용구 변환 시 툴팁 표시 체크박스 추가
    global chkShowTooltips := mainGui.AddCheckbox("x550 y90 w200 c" . Format("{:06X}", VSColors.text) . " Background" . Format("{:06X}", VSColors.bgSecondary), "상용구 변환 시 툴팁 표시")
    chkShowTooltips.SetFont("s9", "Segoe UI")
    chkShowTooltips.Value := 1
    
    inputY := 210
    inputLabel := mainGui.AddText("x20 y" . inputY . " w300 c" . Format("{:06X}", VSColors.text), "상용구 등록 (형식: 키:내용)")
    inputLabel.SetFont("s10 Bold", "Segoe UI")
    
    global phraseInput := mainGui.AddEdit("x20 y" . (inputY + 20) . " w640 h28 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), "")
    phraseInput.SetFont("s10", "Consolas")
    phraseInput.OnEvent("Change", (*) => UpdatePhrasePreview())
    
    btnAddPhrase := CreateVSButton(mainGui, 670, inputY + 19, 110, 30, "+ 등록", true)
    btnAddPhrase.OnEvent("Click", AddPhrase)
    
    mainGui.AddText("x20 y" . (inputY + 55) . " w60 c" . Format("{:06X}", VSColors.textSecondary), "미리보기:")
    global phrasePreview := mainGui.AddText("x85 y" . (inputY + 55) . " w695 c" . Format("{:06X}", VSColors.accent), "")
    phrasePreview.SetFont("s9", "Consolas")
    
    listY := inputY + 80
    listLabel := mainGui.AddText("x20 y" . listY . " w200 c" . Format("{:06X}", VSColors.text), "등록된 상용구:")
    listLabel.SetFont("s10 Bold", "Segoe UI")
    
    btnPhrasePopup := CreateVSButton(mainGui, 700, listY - 2, 80, 24, "별도창 ↗")
    btnPhrasePopup.OnEvent("Click", ShowPhrasePopup)
    
    global phraseListView := mainGui.AddListView("x20 y" . (listY + 25) . " w760 h120 Background" . Format("{:06X}", VSColors.bgTertiary) . " c" . Format("{:06X}", VSColors.text) . " -Theme +LV0x10000", ["키", "내용", "사용횟수"])
    phraseListView.SetFont("s9", "Segoe UI")
    phraseListView.ModifyCol(1, 100)
    phraseListView.ModifyCol(2, 560)
    phraseListView.ModifyCol(3, 80)
    phraseListView.OnEvent("DoubleClick", EditPhrase)
    
    btnY2 := listY + 155
    btnEditPhrase := CreateVSButton(mainGui, 20, btnY2, 80, 26, "수정")
    btnEditPhrase.OnEvent("Click", EditPhrase)
    
    btnDeletePhrase := CreateVSButton(mainGui, 110, btnY2, 80, 26, "삭제")
    btnDeletePhrase.OnEvent("Click", DeletePhrase)
    
    btnClearPhrases := CreateVSButton(mainGui, 200, btnY2, 100, 26, "모두 삭제", false, true)
    btnClearPhrases.OnEvent("Click", ClearAllPhrases)
    
    btnExportPhrases := CreateVSButton(mainGui, 310, btnY2, 80, 26, "내보내기")
    btnExportPhrases.OnEvent("Click", ExportPhrases)
    
    btnImportPhrases := CreateVSButton(mainGui, 400, btnY2, 80, 26, "불러오기")
    btnImportPhrases.OnEvent("Click", ImportPhrases)
    
    ; ===== 대본 송출 탭 =====
    tabControl.UseTab(3)
    
    scriptHeader := mainGui.AddText("x20 y40 w760 h30 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text) . " 0x200", " 대본 송출")
    scriptHeader.SetFont("s11 Bold", "Segoe UI")
    
    scriptInfo := mainGui.AddText("x20 y75 w760 c" . Format("{:06X}", VSColors.textSecondary), "대본을 직접 입력하거나 파일을 열어 한 줄씩 송출할 수 있습니다. (텍스트 파일 드래그&드롭 가능)")
    scriptInfo.SetFont("s9", "Segoe UI")
    
    ctrlY := 100
    btnOpenFile := CreateVSButton(mainGui, 20, ctrlY, 100, 30, "파일 열기", true)
    btnOpenFile.OnEvent("Click", OpenScriptFile)
    
    mainGui.AddText("x130 y" . (ctrlY + 7) . " w40 c" . Format("{:06X}", VSColors.text), "분할:")
    global splitMethodDDL := mainGui.AddDropDownList("x175 y" . (ctrlY + 3) . " w125", ["줄바꿈", "문장 단위", "30자 단위", "40자 단위", "50자 단위", "60자 단위", "구두점 단위", "사용자 지정"])
    splitMethodDDL.Choose(1)
    splitMethodDDL.OnEvent("Change", OnSplitMethodChange)
    
    mainGui.AddText("x310 y" . (ctrlY + 7) . " w30 c" . Format("{:06X}", VSColors.text), "또는")
    global customCharInput := mainGui.AddEdit("x345 y" . (ctrlY + 3) . " w45 h26 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), "")
    customCharInput.SetFont("s9", "Segoe UI")
    customCharInput.OnEvent("Change", OnCustomCharChange)
    mainGui.AddText("x395 y" . (ctrlY + 7) . " w20 c" . Format("{:06X}", VSColors.text), "자")
    
    global chkPunctuation := mainGui.AddCheckbox("x425 y" . (ctrlY + 5) . " w115 c" . Format("{:06X}", VSColors.text), "구두점 추가분할")
    chkPunctuation.SetFont("s8", "Segoe UI")
    chkPunctuation.Value := 0
    chkPunctuation.OnEvent("Click", OnPunctuationChange)
    
    global chkScriptAutoNewline := mainGui.AddCheckbox("x425 y" . (ctrlY + 25) . " w115 c" . Format("{:06X}", VSColors.text), "송출 시 자동줄바꿈")
    chkScriptAutoNewline.SetFont("s8", "Segoe UI")
    chkScriptAutoNewline.Value := scriptAutoNewline
    chkScriptAutoNewline.OnEvent("Click", (*) => UpdateScriptAutoNewline())
    
    searchY := ctrlY + 50
    mainGui.AddText("x545 y" . (searchY + 3) . " w35 c" . Format("{:06X}", VSColors.text), "검색:")
    global scriptSearchInput := mainGui.AddEdit("x585 y" . searchY . " w120 h26 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), "")
    scriptSearchInput.SetFont("s9", "Segoe UI")
    scriptSearchInput.OnEvent("Change", (*) => SearchScript())
    
    btnSearchPrev := CreateVSButton(mainGui, 710, searchY - 1, 30, 28, "◀")
    btnSearchPrev.OnEvent("Click", SearchPrevious)
    
    btnSearchNext := CreateVSButton(mainGui, 745, searchY - 1, 30, 28, "▶")
    btnSearchNext.OnEvent("Click", SearchNext)
    
    btnToggleMode := CreateVSButton(mainGui, 545, ctrlY, 90, 30, "대본 모드")
    btnToggleMode.OnEvent("Click", ToggleScriptMode)
    
    btnClearScript := CreateVSButton(mainGui, 640, ctrlY, 60, 30, "지우기", false, true)
    btnClearScript.OnEvent("Click", ClearScript)
    
    btnAddLine := CreateVSButton(mainGui, 705, ctrlY, 35, 30, "+줄")
    btnAddLine.OnEvent("Click", AddScriptLine)
    
    btnDeleteLine := CreateVSButton(mainGui, 745, ctrlY, 35, 30, "-줄")
    btnDeleteLine.OnEvent("Click", DeleteScriptLine)
    
    listLabel2 := mainGui.AddText("x20 y" . (searchY + 35) . " w200 c" . Format("{:06X}", VSColors.text), "송출 목록:")
    listLabel2.SetFont("s10 Bold", "Segoe UI")
    
    btnScriptPopup := CreateVSButton(mainGui, 700, searchY + 33, 80, 24, "별도창 ↗")
    btnScriptPopup.OnEvent("Click", ShowScriptPopup)
    
    global scriptListView := mainGui.AddListView("x20 y" . (searchY + 60) . " w760 h170 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text) . " -Theme +LV0x10000 +LV0x1", ["번호", "상태", "내용"])
    scriptListView.SetFont("s9", "Segoe UI")
    scriptListView.ModifyCol(1, 60)
    scriptListView.ModifyCol(2, 60)
    scriptListView.ModifyCol(3, 620)
    scriptListView.OnEvent("DoubleClick", EditScriptLine)
    scriptListView.OnEvent("Click", OnScriptListClick)
    
    global hiddenEdit := mainGui.AddEdit("x0 y0 w0 h0 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), "")
    hiddenEdit.OnEvent("LoseFocus", FinishEditScriptLine)
    
    global lblScriptStatus := mainGui.AddText("x20 y375 w400 h25 c" . Format("{:06X}", VSColors.text), "대본 모드: OFF")
    lblScriptStatus.SetFont("s11 Bold", "Segoe UI")
    
    usage1 := mainGui.AddText("x20 y405 w760 c" . Format("{:06X}", VSColors.textSecondary), "Ctrl+Numpad7: 대본 모드 | Ctrl+Numpad5: 현재 줄 송출 | Ctrl+Numpad8: 이전 줄 | Ctrl+Numpad2: 다음 줄 | Ctrl+Numpad9: 자동줄바꿈")
    usage1.SetFont("s8", "Segoe UI")
    
    ; ===== 상태바 =====
    tabControl.UseTab()
    
    global statusBar := mainGui.AddText("x0 y500 w800 h35 Background" . Format("{:06X}", VSColors.bgSecondary), "")
    
    global statusDot := mainGui.AddText("x15 y511 w10 h10 0x200 Background" . Format("{:06X}", VSColors.success), "")
    global statusText := mainGui.AddText("x30 y509 w150 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text), "Ready")
    statusText.SetFont("s9", "Segoe UI")
    
    global speakerCountText := mainGui.AddText("x200 y509 w120 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.textSecondary), "화자: 0/9")
    speakerCountText.SetFont("s9", "Segoe UI")
    
    global phraseCountText := mainGui.AddText("x330 y509 w120 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.textSecondary), "상용구: 0개")
    phraseCountText.SetFont("s9", "Segoe UI")
    
    btnSave := CreateVSButton(mainGui, 580, 505, 85, 25, "저장", true)
    btnSave.OnEvent("Click", SaveSettings)
    
    btnCloseMain := CreateVSButton(mainGui, 675, 505, 85, 25, "종료")
    btnCloseMain.OnEvent("Click", (*) => ExitApp())
    
    mainGui.OnEvent("Close", (*) => ExitApp())
    mainGui.OnEvent("DropFiles", OnDropFiles)
    
    UpdateSpeakerList()
    UpdatePhraseList()
    
    mainGui.Show("w800 h535")
    
    ; 윈도우가 표시된 후 다크 타이틀바 적용
    ApplyDarkTitleBar(mainGui.Hwnd)
}

; ############################################
; #       VS Code 스타일 버튼 생성 함수      #
; ############################################
CreateVSButton(gui, x, y, w, h, text, isPrimary := false, isDanger := false) {
    if (isDanger) {
        bgColor := Format("{:06X}", VSColors.error)
    } else if (isPrimary) {
        bgColor := Format("{:06X}", VSColors.buttonBg)
    } else {
        bgColor := Format("{:06X}", VSColors.bgTertiary)
    }
    
    btn := gui.AddText("x" . x . " y" . y . " w" . w . " h" . h . " Center 0x200 Background" . bgColor . " c" . Format("{:06X}", VSColors.text) . " Border", text)
    btn.SetFont("s9", "Segoe UI")
    
    return btn
}

; ############################################
; #      탭 문자 삽입 함수                  #
; ############################################
InsertTabToSuffix(*) {
    currentSuffix := edtSuffix.Text
    edtSuffix.Text := currentSuffix . "`t"
    UpdateSpeakerFormat()
    ShowModernTooltip("탭 문자가 추가되었습니다", 1000)
}

; ############################################
; #      별도창 수정 반영 버그 수정          #
; ############################################
EditScriptLineInPopup(*) {
    selected := scriptPopupListView.GetNext()
    if (!selected) {
        return
    }
    
    if (IsObject(scriptListView) && scriptListView.Hwnd) {
        scriptListView.Modify(0, "-Select")
        scriptListView.Modify(selected, "Select Focus")
    }
    
    currentText := ""
    if (selected <= scriptLines.Length) {
        currentText := scriptLines[selected]
    }
    
    ib := InputBox("내용을 수정하세요:", "줄 편집 - " . selected, "w500 h120")
    ib.Value := currentText
    
    if (ib.Result = "OK") {
        if (selected <= scriptLines.Length) {
            cleanText := StrReplace(ib.Value, "`r", "")
            cleanText := StrReplace(cleanText, "`n", "")
            cleanText := LTrim(cleanText)
            scriptLines[selected] := cleanText
            
            global scriptSearchResults := []
            global currentSearchIndex := 0
            global scriptPopupSearchResults := []
            global currentPopupSearchIndex := 0
            
            UpdateScriptListView()
            UpdateScriptPopupListView()
        }
    }
}

EditSpeakerInPopup(*) {
    selected := speakerPopupListView.GetNext()
    if (!selected) {
        return
    }
    
    currentName := speakers[selected].name
    ib := InputBox("새 이름을 입력하세요:", "화자 이름 수정", "w300 h120")
    ib.Value := currentName
    
    if (ib.Result = "OK" && ib.Value != "") {
        speakers[selected].name := ib.Value
        
        UpdateSpeakerList()
        UpdateSpeakerPopupListView()
        
        if (IsObject(speakerListView) && speakerListView.Hwnd) {
            speakerListView.Modify(selected, "Select Focus")
        }
        
        SaveSettings()
    }
}

EditPhraseInPopup(*) {
    selected := phrasePopupListView.GetNext()
    if (!selected) {
        return
    }
    
    key := phrasePopupListView.GetText(selected, 1)
    
    if (!phrases.Has(key)) {
        MsgBox("선택한 상용구를 찾을 수 없습니다.", "오류", "Icon!")
        return
    }
    
    currentData := phrases[key]
    currentContent := currentData.content
    currentCount := currentData.HasProp("count") ? currentData.count : 0
    
    ib := InputBox("새 내용을 입력하세요:`n`n현재: " . currentContent, "상용구 수정 - " . key, "w400 h120")
    
    if (ib.Result = "OK" && ib.Value != "") {
        phrases[key] := {content: ib.Value, count: currentCount}
        
        UpdatePhraseList()
        UpdatePhrasePopupListView()
        
        if (IsObject(phraseListView) && phraseListView.Hwnd) {
            Loop phraseListView.GetCount() {
                if (phraseListView.GetText(A_Index, 1) = key) {
                    phraseListView.Modify(A_Index, "Select Focus")
                    break
                }
            }
        }
        
        SaveSettings()
        
        if (chkShowTooltips.Value) {
            ShowModernTooltip("상용구 '" . key . "' 수정 완료", 1500)
        }
    }
}

; ############################################
; #       대본 송출 관련 함수들              #
; ############################################
UpdateScriptAutoNewline() {
    global scriptAutoNewline := chkScriptAutoNewline.Value
    SaveSettings()
    
    if (scriptAutoNewline) {
        ShowModernTooltip("대본 송출 시 자동 줄바꿈 ON", 1000)
    } else {
        ShowModernTooltip("대본 송출 시 자동 줄바꿈 OFF", 1000)
    }
}

ToggleScriptAutoNewline(*) {
    global scriptAutoNewline := !scriptAutoNewline
    
    if (IsObject(chkScriptAutoNewline)) {
        chkScriptAutoNewline.Value := scriptAutoNewline
    }
    
    UpdateScriptAutoNewline()
}

SearchScript(*) {
    global scriptSearchResults := []
    global currentSearchIndex := 0
    
    searchText := Trim(scriptSearchInput.Text)
    if (searchText = "") {
        UpdateScriptListView()
        return
    }
    
    searchTextLower := StrLower(searchText)
    
    Loop scriptLines.Length {
        if (InStr(StrLower(scriptLines[A_Index]), searchTextLower)) {
            scriptSearchResults.Push(A_Index)
        }
    }
    
    if (scriptSearchResults.Length > 0) {
        currentSearchIndex := 1
        JumpToSearchResult(scriptSearchResults[1])
        ShowModernTooltip(scriptSearchResults.Length . "개 찾음", 1000)
    } else {
        ShowModernTooltip("검색 결과 없음", 1000)
    }
}

SearchNext(*) {
    if (scriptSearchResults.Length = 0) {
        SearchScript()
        return
    }
    
    global currentSearchIndex := currentSearchIndex + 1
    if (currentSearchIndex > scriptSearchResults.Length) {
        currentSearchIndex := 1
    }
    
    JumpToSearchResult(scriptSearchResults[currentSearchIndex])
    ShowModernTooltip(currentSearchIndex . "/" . scriptSearchResults.Length, 800)
}

SearchPrevious(*) {
    if (scriptSearchResults.Length = 0) {
        SearchScript()
        return
    }
    
    global currentSearchIndex := currentSearchIndex - 1
    if (currentSearchIndex < 1) {
        currentSearchIndex := scriptSearchResults.Length
    }
    
    JumpToSearchResult(scriptSearchResults[currentSearchIndex])
    ShowModernTooltip(currentSearchIndex . "/" . scriptSearchResults.Length, 800)
}

JumpToSearchResult(lineIndex) {
    global currentLineIndex := lineIndex
    UpdateScriptStatus()
    
    if (IsObject(scriptListView) && scriptListView.Hwnd) {
        scriptListView.Modify(0, "-Select")
        scriptListView.Modify(lineIndex, "Select Focus Vis")
        scriptListView.Modify(lineIndex, "+Check")
    }
    
    if (IsObject(scriptPopupListView) && scriptPopupListView.Hwnd) {
        scriptPopupListView.Modify(0, "-Select")
        scriptPopupListView.Modify(lineIndex, "Select Focus Vis")
    }
}

; ############################################
; #       스크립트 팝업창 함수들             #
; ############################################
ShowScriptPopup(*) {
    if (IsObject(scriptPopupGui) && scriptPopupGui.Hwnd) {
        try {
            scriptPopupGui.Show()
            return
        }
    }
    
    global scriptPopupGui := Gui("+Resize", "대본 송출 목록")
    scriptPopupGui.BackColor := Format("{:06X}", VSColors.bg)
    
    scriptPopupGui.AddText("x10 y10 w35 c" . Format("{:06X}", VSColors.text), "검색:")
    global scriptPopupSearchInput := scriptPopupGui.AddEdit("x50 y8 w150 h24 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), "")
    scriptPopupSearchInput.SetFont("s9", "Segoe UI")
    scriptPopupSearchInput.OnEvent("Change", (*) => PopupSearchScript())
    
    global scriptPopupSearchPrev := scriptPopupGui.AddText("x205 y8 w30 h24 Center 0x200 Background" . Format("{:06X}", VSColors.bgTertiary) . " c" . Format("{:06X}", VSColors.text) . " Border", "◀")
    scriptPopupSearchPrev.SetFont("s10", "Segoe UI")
    scriptPopupSearchPrev.OnEvent("Click", PopupSearchPrevious)
    
    global scriptPopupSearchNext := scriptPopupGui.AddText("x240 y8 w30 h24 Center 0x200 Background" . Format("{:06X}", VSColors.bgTertiary) . " c" . Format("{:06X}", VSColors.text) . " Border", "▶")
    scriptPopupSearchNext.SetFont("s10", "Segoe UI")
    scriptPopupSearchNext.OnEvent("Click", PopupSearchNext)
    
    scriptPopupGui.AddText("x275 y10 w200 c" . Format("{:06X}", VSColors.textSecondary), "(Ctrl+F: 검색 / Esc: 검색 취소)")
    scriptPopupGui.SetFont("s8", "Segoe UI")
    
    global scriptPopupListView := scriptPopupGui.AddListView("x10 y40 w780 h450 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text) . " -Theme +LV0x10000 +LV0x1", ["번호", "상태", "내용"])
    scriptPopupListView.SetFont("s10", "Segoe UI")
    scriptPopupListView.ModifyCol(1, 60)
    scriptPopupListView.ModifyCol(2, 60)
    scriptPopupListView.ModifyCol(3, 640)
    scriptPopupListView.OnEvent("DoubleClick", EditScriptLineInPopup)
    scriptPopupListView.OnEvent("Click", OnScriptListClickInPopup)
    
    global scriptPopupStatus := scriptPopupGui.AddText("x10 y500 w780 h25 c" . Format("{:06X}", VSColors.text), "")
    scriptPopupStatus.SetFont("s9", "Segoe UI")
    
    scriptPopupGui.OnEvent("Size", OnScriptPopupResize)
    scriptPopupGui.OnEvent("Close", CloseScriptPopup)
    
    HotIfWinActive("ahk_id " . scriptPopupGui.Hwnd)
    try {
        Hotkey("^f", PopupSearchFocus)
        Hotkey("Escape", PopupEscapeHandler)
        Hotkey("Enter", PopupEnterHandler)
    } catch as err {
    }
    HotIfWinActive()
    
    popupWidth := Integer(IniRead(settingsFile, "ScriptPopup", "Width", 800))
    popupHeight := Integer(IniRead(settingsFile, "ScriptPopup", "Height", 540))
    popupX := IniRead(settingsFile, "ScriptPopup", "X", "")
    popupY := IniRead(settingsFile, "ScriptPopup", "Y", "")
    
    UpdateScriptPopupListView()
    
    if (popupX != "" && popupY != "") {
        scriptPopupGui.Show("w" . popupWidth . " h" . popupHeight . " x" . popupX . " y" . popupY)
    } else {
        scriptPopupGui.Show("w" . popupWidth . " h" . popupHeight)
    }
}

OnScriptPopupResize(gui, MinMax, Width, Height) {
    if (MinMax = -1) {
        return
    }
    
    newListWidth := Width - 20
    newListHeight := Height - 100
    
    scriptPopupListView.Move(10, 40, newListWidth, newListHeight)
    
    col1Width := 60
    col2Width := 60
    col3Width := newListWidth - col1Width - col2Width - 20
    
    scriptPopupListView.ModifyCol(1, col1Width)
    scriptPopupListView.ModifyCol(2, col2Width)
    scriptPopupListView.ModifyCol(3, col3Width)
    
    gui.GetClientPos(, , &clientWidth, &clientHeight)
    statusY := clientHeight - 30
    
    if (IsObject(scriptPopupStatus) && scriptPopupStatus.Hwnd) {
        scriptPopupStatus.Move(10, statusY, clientWidth - 20)
    }
    
    if (MinMax = 0) {
        gui.GetPos(&guiX, &guiY)
        IniWrite(Width, settingsFile, "ScriptPopup", "Width")
        IniWrite(Height, settingsFile, "ScriptPopup", "Height")
        IniWrite(guiX, settingsFile, "ScriptPopup", "X")
        IniWrite(guiY, settingsFile, "ScriptPopup", "Y")
    }
}

UpdateScriptPopupListView() {
    if (!IsObject(scriptPopupListView) || !scriptPopupListView.Hwnd) {
        return
    }
    
    scriptPopupListView.Delete()
    
    popupSearchText := ""
    if (IsObject(scriptPopupSearchInput) && scriptPopupSearchInput.Text != "") {
        popupSearchText := StrLower(Trim(scriptPopupSearchInput.Text))
    }
    
    Loop scriptLines.Length {
        status := (A_Index = currentLineIndex) ? "▶" : "○"
        content := scriptLines[A_Index]
        
        if (popupSearchText != "" && InStr(StrLower(content), popupSearchText)) {
            content := "🔍 " . content
        }
        
        scriptPopupListView.Add("", A_Index, status, content)
    }
    
    if (currentLineIndex > 0 && currentLineIndex <= scriptLines.Length) {
        scriptPopupListView.Modify(currentLineIndex, "Select Focus Vis")
        
        if (currentLineIndex + 3 <= scriptLines.Length) {
            scriptPopupListView.Modify(currentLineIndex + 3, "Vis")
        }
    }
    
    if (IsObject(scriptPopupStatus) && scriptPopupStatus.Hwnd) {
        if (scriptLines.Length > 0) {
            statusText := "총 " . scriptLines.Length . "줄 | 현재: " . currentLineIndex . "줄"
            if (popupSearchText != "" && scriptPopupSearchResults.Length > 0) {
                statusText .= " | 검색: " . scriptPopupSearchResults.Length . "개"
            }
            scriptPopupStatus.Text := statusText
        } else {
            scriptPopupStatus.Text := "대본 없음"
        }
    }
}

CloseScriptPopup(*) {
    if (IsObject(scriptPopupGui) && scriptPopupGui.Hwnd) {
        HotIfWinActive("ahk_id " . scriptPopupGui.Hwnd)
        try {
            Hotkey("^f", "Off")
            Hotkey("Escape", "Off")
            Hotkey("Enter", "Off")
        } catch {
        }
        HotIfWinActive()
    }
    
    global scriptPopupGui := ""
    global scriptPopupListView := ""
    global scriptPopupStatus := ""
    global scriptPopupSearchInput := ""
    global scriptPopupSearchPrev := ""
    global scriptPopupSearchNext := ""
    global scriptPopupSearchResults := []
    global currentPopupSearchIndex := 0
}

PopupSearchScript(*) {
    global scriptPopupSearchResults := []
    global currentPopupSearchIndex := 0
    
    searchText := Trim(scriptPopupSearchInput.Text)
    if (searchText = "") {
        UpdateScriptPopupListView()
        return
    }
    
    searchTextLower := StrLower(searchText)
    
    Loop scriptLines.Length {
        if (InStr(StrLower(scriptLines[A_Index]), searchTextLower)) {
            scriptPopupSearchResults.Push(A_Index)
        }
    }
    
    if (scriptPopupSearchResults.Length > 0) {
        currentPopupSearchIndex := 1
        PopupJumpToSearchResult(scriptPopupSearchResults[1])
        ShowModernTooltip(scriptPopupSearchResults.Length . "개 찾음", 1000)
    } else {
        ShowModernTooltip("검색 결과 없음", 1000)
        UpdateScriptPopupListView()
    }
}

PopupSearchNext(*) {
    if (scriptPopupSearchResults.Length = 0) {
        PopupSearchScript()
        return
    }
    
    global currentPopupSearchIndex := currentPopupSearchIndex + 1
    if (currentPopupSearchIndex > scriptPopupSearchResults.Length) {
        currentPopupSearchIndex := 1
    }
    
    PopupJumpToSearchResult(scriptPopupSearchResults[currentPopupSearchIndex])
    ShowModernTooltip(currentPopupSearchIndex . "/" . scriptPopupSearchResults.Length, 800)
}

PopupSearchPrevious(*) {
    if (scriptPopupSearchResults.Length = 0) {
        PopupSearchScript()
        return
    }
    
    global currentPopupSearchIndex := currentPopupSearchIndex - 1
    if (currentPopupSearchIndex < 1) {
        currentPopupSearchIndex := scriptPopupSearchResults.Length
    }
    
    PopupJumpToSearchResult(scriptPopupSearchResults[currentPopupSearchIndex])
    ShowModernTooltip(currentPopupSearchIndex . "/" . scriptPopupSearchResults.Length, 800)
}

PopupJumpToSearchResult(lineIndex) {
    global currentLineIndex := lineIndex
    UpdateScriptStatus()
    
    if (IsObject(scriptPopupListView) && scriptPopupListView.Hwnd) {
        scriptPopupListView.Modify(0, "-Select")
        scriptPopupListView.Modify(lineIndex, "Select Focus Vis")
        scriptPopupListView.Modify(lineIndex, "+Check")
    }
    
    if (IsObject(scriptListView) && scriptListView.Hwnd) {
        scriptListView.Modify(0, "-Select")
        scriptListView.Modify(lineIndex, "Select Focus Vis")
    }
}

PopupSearchFocus(*) {
    if (IsObject(scriptPopupSearchInput) && scriptPopupSearchInput.Hwnd) {
        scriptPopupSearchInput.Focus()
        scriptPopupSearchInput.Text := ""
    }
}

PopupEscapeHandler(*) {
    try {
        focused := scriptPopupGui.FocusedCtrl
        
        if (focused = scriptPopupSearchInput) {
            scriptPopupSearchInput.Text := ""
            global scriptPopupSearchResults := []
            global currentPopupSearchIndex := 0
            UpdateScriptPopupListView()
            scriptPopupListView.Focus()
            return
        }
    }
    
    Send("{Escape}")
}

PopupEnterHandler(*) {
    try {
        focused := scriptPopupGui.FocusedCtrl
        
        if (focused = scriptPopupSearchInput) {
            PopupSearchNext()
            return
        }
    }
    
    Send("{Enter}")
}

; ############################################
; #       화자/상용구 팝업창 함수들          #
; ############################################
ShowSpeakerPopup(*) {
    if (IsObject(speakerPopupGui) && speakerPopupGui.Hwnd) {
        try {
            speakerPopupGui.Show()
            return
        }
    }
    
    global speakerPopupGui := Gui("+Resize", "화자 목록")
    speakerPopupGui.BackColor := Format("{:06X}", VSColors.bg)
    
    global speakerPopupListView := speakerPopupGui.AddListView("x10 y10 w780 h480 Background" . Format("{:06X}", VSColors.bgTertiary) . " c" . Format("{:06X}", VSColors.text) . " -Theme +LV0x10000", ["번호", "이름", "단축키", "형식 예시"])
    speakerPopupListView.SetFont("s10", "Segoe UI")
    speakerPopupListView.ModifyCol(1, 60)
    speakerPopupListView.ModifyCol(2, 200)
    speakerPopupListView.ModifyCol(3, 150)
    speakerPopupListView.ModifyCol(4, 350)
    speakerPopupListView.OnEvent("DoubleClick", EditSpeakerInPopup)
    
    global speakerPopupStatus := speakerPopupGui.AddText("x10 y500 w780 h25 c" . Format("{:06X}", VSColors.text), "")
    speakerPopupStatus.SetFont("s9", "Segoe UI")
    
    speakerPopupGui.OnEvent("Size", OnSpeakerPopupResize)
    speakerPopupGui.OnEvent("Close", CloseSpeakerPopup)
    
    popupWidth := Integer(IniRead(settingsFile, "SpeakerPopup", "Width", 800))
    popupHeight := Integer(IniRead(settingsFile, "SpeakerPopup", "Height", 540))
    popupX := IniRead(settingsFile, "SpeakerPopup", "X", "")
    popupY := IniRead(settingsFile, "SpeakerPopup", "Y", "")
    
    UpdateSpeakerPopupListView()
    
    if (popupX != "" && popupY != "") {
        speakerPopupGui.Show("w" . popupWidth . " h" . popupHeight . " x" . popupX . " y" . popupY)
    } else {
        speakerPopupGui.Show("w" . popupWidth . " h" . popupHeight)
    }
}

OnSpeakerPopupResize(gui, MinMax, Width, Height) {
    if (MinMax = -1) {
        return
    }
    
    newListWidth := Width - 20
    newListHeight := Height - 60
    speakerPopupListView.Move(10, 10, newListWidth, newListHeight)
    
    col1Width := 60
    col2Width := Integer(newListWidth * 0.25)
    col3Width := Integer(newListWidth * 0.19)
    col4Width := newListWidth - col1Width - col2Width - col3Width - 20
    
    speakerPopupListView.ModifyCol(1, col1Width)
    speakerPopupListView.ModifyCol(2, col2Width)
    speakerPopupListView.ModifyCol(3, col3Width)
    speakerPopupListView.ModifyCol(4, col4Width)
    
    gui.GetClientPos(, , &clientWidth, &clientHeight)
    statusY := clientHeight - 30
    
    if (IsObject(speakerPopupStatus) && speakerPopupStatus.Hwnd) {
        speakerPopupStatus.Move(10, statusY, clientWidth - 20)
    }
    
    if (MinMax = 0) {
        gui.GetPos(&guiX, &guiY)
        IniWrite(Width, settingsFile, "SpeakerPopup", "Width")
        IniWrite(Height, settingsFile, "SpeakerPopup", "Height")
        IniWrite(guiX, settingsFile, "SpeakerPopup", "X")
        IniWrite(guiY, settingsFile, "SpeakerPopup", "Y")
    }
}

UpdateSpeakerPopupListView() {
    if (!IsObject(speakerPopupListView) || !speakerPopupListView.Hwnd) {
        return
    }
    
    speakerPopupListView.Delete()
    
    circleNumbers := ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"]
    
    Loop speakers.Length {
        num := circleNumbers[A_Index]
        name := speakers[A_Index].name
        shortcut := "Insert+" . A_Index
        
        formatExample := speakerPrefix . name . speakerSuffix
        formatExample := StrReplace(formatExample, "`t", "→탭")
        
        if (speakerAutoNewline) {
            formatExample := "↵" . formatExample
        }
        
        speakerPopupListView.Add("", num, name, shortcut, formatExample)
    }
    
    if (IsObject(speakerPopupStatus) && speakerPopupStatus.Hwnd) {
        speakerPopupStatus.Text := "총 " . speakers.Length . "/9명 등록"
    }
}

CloseSpeakerPopup(*) {
    global speakerPopupGui := ""
    global speakerPopupListView := ""
    global speakerPopupStatus := ""
}

ShowPhrasePopup(*) {
    if (IsObject(phrasePopupGui) && phrasePopupGui.Hwnd) {
        try {
            phrasePopupGui.Show()
            return
        }
    }
    
    global phrasePopupGui := Gui("+Resize", "상용구 목록")
    phrasePopupGui.BackColor := Format("{:06X}", VSColors.bg)
    
    global phrasePopupListView := phrasePopupGui.AddListView("x10 y10 w780 h480 Background" . Format("{:06X}", VSColors.bgTertiary) . " c" . Format("{:06X}", VSColors.text) . " -Theme +LV0x10000", ["키", "내용", "사용횟수"])
    phrasePopupListView.SetFont("s10", "Segoe UI")
    phrasePopupListView.ModifyCol(1, 100)
    phrasePopupListView.ModifyCol(2, 580)
    phrasePopupListView.ModifyCol(3, 80)
    phrasePopupListView.OnEvent("DoubleClick", EditPhraseInPopup)
    
    global phrasePopupStatus := phrasePopupGui.AddText("x10 y500 w780 h25 c" . Format("{:06X}", VSColors.text), "")
    phrasePopupStatus.SetFont("s9", "Segoe UI")
    
    phrasePopupGui.OnEvent("Size", OnPhrasePopupResize)
    phrasePopupGui.OnEvent("Close", ClosePhrasePopup)
    
    popupWidth := Integer(IniRead(settingsFile, "PhrasePopup", "Width", 800))
    popupHeight := Integer(IniRead(settingsFile, "PhrasePopup", "Height", 540))
    popupX := IniRead(settingsFile, "PhrasePopup", "X", "")
    popupY := IniRead(settingsFile, "PhrasePopup", "Y", "")
    
    UpdatePhrasePopupListView()
    
    if (popupX != "" && popupY != "") {
        phrasePopupGui.Show("w" . popupWidth . " h" . popupHeight . " x" . popupX . " y" . popupY)
    } else {
        phrasePopupGui.Show("w" . popupWidth . " h" . popupHeight)
    }
}

OnPhrasePopupResize(gui, MinMax, Width, Height) {
    if (MinMax = -1) {
        return
    }
    
    newListWidth := Width - 20
    newListHeight := Height - 60
    phrasePopupListView.Move(10, 10, newListWidth, newListHeight)
    
    col1Width := 100
    col3Width := 80
    col2Width := newListWidth - col1Width - col3Width - 20
    
    phrasePopupListView.ModifyCol(1, col1Width)
    phrasePopupListView.ModifyCol(2, col2Width)
    phrasePopupListView.ModifyCol(3, col3Width)
    
    gui.GetClientPos(, , &clientWidth, &clientHeight)
    statusY := clientHeight - 30
    
    if (IsObject(phrasePopupStatus) && phrasePopupStatus.Hwnd) {
        phrasePopupStatus.Move(10, statusY, clientWidth - 20)
    }
    
    if (MinMax = 0) {
        gui.GetPos(&guiX, &guiY)
        IniWrite(Width, settingsFile, "PhrasePopup", "Width")
        IniWrite(Height, settingsFile, "PhrasePopup", "Height")
        IniWrite(guiX, settingsFile, "PhrasePopup", "X")
        IniWrite(guiY, settingsFile, "PhrasePopup", "Y")
    }
}

UpdatePhrasePopupListView() {
    if (!IsObject(phrasePopupListView) || !phrasePopupListView.Hwnd) {
        return
    }
    
    phrasePopupListView.Delete()
    
    for key, data in phrases {
        content := data.content
        count := data.HasProp("count") ? data.count : 0
        phrasePopupListView.Add("", key, content, count)
    }
    
    if (IsObject(phrasePopupStatus) && phrasePopupStatus.Hwnd) {
        phrasePopupStatus.Text := "총 " . phrases.Count . "개 등록"
    }
}

ClosePhrasePopup(*) {
    global phrasePopupGui := ""
    global phrasePopupListView := ""
    global phrasePopupStatus := ""
}

OnScriptListClick(*) {
    selected := 0
    if (IsObject(scriptListView) && scriptListView.Hwnd) {
        selected := scriptListView.GetNext()
        if (selected > 0) {
            global currentLineIndex := selected
            UpdateScriptStatus()
        }
    }
}

OnScriptListClickInPopup(*) {
    selected := 0
    if (IsObject(scriptPopupListView) && scriptPopupListView.Hwnd) {
        selected := scriptPopupListView.GetNext()
        if (selected > 0) {
            global currentLineIndex := selected
            UpdateScriptStatus()
        }
    }
}

; ############################################
; #       드래그&드롭 및 대본 송출 함수      #
; ############################################
OnDropFiles(gui, ctrl, fileArray, x, y) {
    if (tabControl.Value != 3) {
        return
    }
    
    if (fileArray.Length > 1) {
        ShowModernTooltip("첫 번째 파일만 처리됩니다.", 1500)
    }
    
    if (fileArray.Length > 0) {
        filePath := fileArray[1]
        
        if (StrLower(SubStr(filePath, -4)) != ".txt") {
            ShowModernTooltip("텍스트 파일(.txt)만 지원합니다.", 2000)
            return
        }
        
        if (scriptLines.Length > 0) {
            result := MsgBox("기존 대본을 교체하시겠습니까?", "확인", "YesNo Icon?")
            if (result = "No") {
                return
            }
        }
        
        try {
            fileContent := FileRead(filePath, "UTF-8")
            ProcessScriptText(fileContent)
            
            SplitPath(filePath, &fileName)
            ShowModernTooltip("파일 로드: " . fileName, 1500)
        } catch as err {
            MsgBox("파일을 읽는 중 오류가 발생했습니다.`n`n" . err.Message, "오류", "Icon!")
        }
    }
}

OnPunctuationChange(*) {
    if (scriptLines.Length > 0) {
        OnSplitMethodChange()
    }
}

ApplyPunctuationSplit() {
    global scriptLines
    newLines := []
    
    for line in scriptLines {
        tempText := line
        
        tempText := StrReplace(tempText, ". ", ".☆")
        tempText := StrReplace(tempText, "! ", "!☆")
        tempText := StrReplace(tempText, "? ", "?☆")
        tempText := StrReplace(tempText, "; ", ";☆")
        
        tempText := StrReplace(tempText, ".", ".☆")
        tempText := StrReplace(tempText, "!", "!☆")
        tempText := StrReplace(tempText, "?", "?☆")
        tempText := StrReplace(tempText, ";", ";☆")
        
        tempText := StrReplace(tempText, " / ", "☆")
        tempText := StrReplace(tempText, "/", "☆")
        tempText := StrReplace(tempText, " | ", "☆")
        tempText := StrReplace(tempText, "|", "☆")
        
        splitParts := StrSplit(tempText, "☆")
        for part in splitParts {
            part := StrReplace(part, "`r", "")
            part := StrReplace(part, "`n", "")
            part := LTrim(part)
            if (part != "") {
                newLines.Push(part)
            }
        }
    }
    
    scriptLines := newLines
}

OnCustomCharChange(*) {
    if (customCharInput.Text != "" && splitMethodDDL.Text != "사용자 지정") {
        splitMethodDDL.Choose(8)
    }
}

AddScriptLine(*) {
    global scriptLines
    scriptLines.Push("")
    
    global scriptSearchResults := []
    global currentSearchIndex := 0
    
    UpdateScriptListView()
    
    newIndex := scriptLines.Length
    scriptListView.Modify(newIndex, "Select Focus")
    EditScriptLine()
}

DeleteScriptLine(*) {
    selected := scriptListView.GetNext()
    if (!selected) {
        MsgBox("삭제할 줄을 선택하세요.", "알림", "Icon!")
        return
    }
    
    global scriptLines
    scriptLines.RemoveAt(selected)
    
    global currentLineIndex
    if (currentLineIndex > scriptLines.Length) {
        currentLineIndex := scriptLines.Length
    }
    if (currentLineIndex < 1 && scriptLines.Length > 0) {
        currentLineIndex := 1
    }
    
    global scriptSearchResults := []
    global currentSearchIndex := 0
    
    UpdateScriptListView()
    UpdateScriptStatus()
}

EditScriptLine(*) {
    selected := scriptListView.GetNext()
    if (!selected) {
        return
    }
    
    currentText := ""
    if (selected <= scriptLines.Length) {
        currentText := scriptLines[selected]
    }
    
    scriptListView.GetPos(&lvX, &lvY, &lvW, &lvH)
    
    editY := lvY + 20 + (selected - 1) * 20
    editX := lvX + 120
    editW := lvW - 120
    
    global hiddenEdit
    hiddenEdit.Text := currentText
    hiddenEdit.Move(editX, editY, editW, 20)
    hiddenEdit.Visible := true
    hiddenEdit.Focus()
    
    global editingLineIndex := selected
}

FinishEditScriptLine(*) {
    global hiddenEdit, editingLineIndex, scriptLines
    
    if (!hiddenEdit.Visible) {
        return
    }
    
    newText := hiddenEdit.Text
    newText := StrReplace(newText, "`r", "")
    newText := StrReplace(newText, "`n", "")
    newText := LTrim(newText)
    
    if (editingLineIndex > 0 && editingLineIndex <= scriptLines.Length) {
        scriptLines[editingLineIndex] := newText
        
        global scriptSearchResults := []
        global currentSearchIndex := 0
    }
    
    hiddenEdit.Visible := false
    hiddenEdit.Move(0, 0, 0, 0)
    
    UpdateScriptListView()
    
    editingLineIndex := 0
}

ProcessScriptText(text := "") {
    if (text = "") {
        if (A_Clipboard = "") {
            return
        }
        text := A_Clipboard
    }
    
    text := StrReplace(text, "`r`n", "`n")
    text := StrReplace(text, "`r", "`n")
    
    while (InStr(text, "`n`n")) {
        text := StrReplace(text, "`n`n", "`n")
    }
    
    scriptListView.Opt("-Redraw")
    
    splitMethod := splitMethodDDL.Text
    
    global scriptLines := []
    
    if (splitMethod = "사용자 지정") {
        if (customCharInput.Text = "") {
            ShowModernTooltip("사용자 지정 글자수를 입력하세요.", 1500)
            customCharInput.Focus()
            scriptListView.Opt("+Redraw")
            return
        }
        
        charLimit := 50
        inputValue := Trim(customCharInput.Text)
        
        if (!IsNumber(inputValue)) {
            ShowModernTooltip("숫자만 입력하세요.", 1500)
            scriptListView.Opt("+Redraw")
            return
        }
        
        charLimit := Integer(inputValue)
        if (charLimit < 10) {
            ShowModernTooltip("최소 10자 이상으로 설정합니다.", 1500)
            charLimit := 10
        } else if (charLimit > 100) {
            ShowModernTooltip(charLimit . "자로 설정. 100자 이상은 주의가 필요합니다.", 1500)
        }
        
        text := StrReplace(text, "`r`n", " ")
        text := StrReplace(text, "`n", " ")
        
        while (StrLen(text) > 0) {
            if (StrLen(text) <= charLimit) {
                text := StrReplace(text, "`r", "")
                text := StrReplace(text, "`n", "")
                text := RTrim(LTrim(text))
                if (text != "") {
                    scriptLines.Push(text)
                }
                break
            }
            
            cutPos := charLimit
            minPos := Integer(charLimit * 0.6)
            
            while (cutPos > minPos && SubStr(text, cutPos, 1) != " ") {
                cutPos := cutPos - 1
            }
            
            if (cutPos <= minPos) {
                cutPos := charLimit
            }
            
            cutText := SubStr(text, 1, cutPos)
            cutText := StrReplace(cutText, "`r", "")
            cutText := StrReplace(cutText, "`n", "")
            cutText := LTrim(cutText)
            if (cutText != "") {
                scriptLines.Push(cutText)
            }
            
            text := SubStr(text, cutPos + 1)
        }
        
        if (chkPunctuation.Value) {
            ApplyPunctuationSplit()
        }
    }
    else if (InStr(splitMethod, "자 단위")) {
        charLimit := 50
        if (splitMethod = "30자 단위") {
            charLimit := 30
        } else if (splitMethod = "40자 단위") {
            charLimit := 40
        } else if (splitMethod = "60자 단위") {
            charLimit := 60
        }
        
        text := StrReplace(text, "`r`n", " ")
        text := StrReplace(text, "`n", " ")
        
        while (StrLen(text) > 0) {
            if (StrLen(text) <= charLimit) {
                text := StrReplace(text, "`r", "")
                text := StrReplace(text, "`n", "")
                text := RTrim(LTrim(text))
                if (text != "") {
                    scriptLines.Push(text)
                }
                break
            }
            
            cutPos := charLimit
            minPos := Integer(charLimit * 0.6)
            
            while (cutPos > minPos && SubStr(text, cutPos, 1) != " ") {
                cutPos := cutPos - 1
            }
            
            if (cutPos <= minPos) {
                cutPos := charLimit
            }
            
            cutText := SubStr(text, 1, cutPos)
            cutText := StrReplace(cutText, "`r", "")
            cutText := StrReplace(cutText, "`n", "")
            cutText := LTrim(cutText)
            if (cutText != "") {
                scriptLines.Push(cutText)
            }
            
            text := SubStr(text, cutPos + 1)
        }
        
        if (chkPunctuation.Value) {
            ApplyPunctuationSplit()
        }
    }
    else if (splitMethod = "문장 단위") {
        text := StrReplace(text, ". ", ".`n")
        text := StrReplace(text, "! ", "!`n")
        text := StrReplace(text, "? ", "?`n")
        
        lines := StrSplit(text, "`n")
        for line in lines {
            line := StrReplace(line, "`r", "")
            line := StrReplace(line, "`n", "")
            line := LTrim(line)
            if (line != "") {
                scriptLines.Push(line)
            }
        }
        
        if (chkPunctuation.Value) {
            ApplyPunctuationSplit()
        }
    }
    else if (splitMethod = "구두점 단위") {
        text := StrReplace(text, ". ", ".`n")
        text := StrReplace(text, "! ", "!`n")
        text := StrReplace(text, "? ", "?`n")
        text := StrReplace(text, "; ", ";`n")
        
        text := StrReplace(text, ".`n", "☆")
        text := StrReplace(text, ".", ".`n")
        text := StrReplace(text, "☆", ".`n")
        
        text := StrReplace(text, "!`n", "☆")
        text := StrReplace(text, "!", "!`n")
        text := StrReplace(text, "☆", "!`n")
        
        text := StrReplace(text, "?`n", "☆")
        text := StrReplace(text, "?", "?`n")
        text := StrReplace(text, "☆", "?`n")
        
        text := StrReplace(text, ";`n", "☆")
        text := StrReplace(text, ";", ";`n")
        text := StrReplace(text, "☆", ";`n")
        
        text := StrReplace(text, " / ", "`n")
        text := StrReplace(text, "/", "`n")
        text := StrReplace(text, " | ", "`n")
        text := StrReplace(text, "|", "`n")
        
        while (InStr(text, "`n`n")) {
            text := StrReplace(text, "`n`n", "`n")
        }
        
        lines := StrSplit(text, "`n")
        for line in lines {
            line := LTrim(line)
            if (line != "" && line != "`r") {
                scriptLines.Push(line)
            }
        }
    }
    else {
        lines := StrSplit(text, "`n")
        for line in lines {
            line := LTrim(line)
            if (line != "" && line != "`r") {
                scriptLines.Push(line)
            }
        }
        
        if (chkPunctuation.Value && splitMethod = "줄바꿈") {
            ApplyPunctuationSplit()
        }
    }
    
    scriptListView.Opt("+Redraw")
    
    cleanedLines := []
    for line in scriptLines {
        if (line != "") {
            cleanedLines.Push(line)
        }
    }
    scriptLines := cleanedLines
    
    UpdateScriptListView()
    
    global currentLineIndex := 1
    UpdateScriptStatus()
    
    global scriptSearchResults := []
    global currentSearchIndex := 0
    
    if (scriptLines.Length > 0) {
        ShowModernTooltip(scriptLines.Length . "개의 줄이 로드되었습니다.", 1500)
    }
}

ClearScript(*) {
    result := MsgBox("대본을 모두 지우시겠습니까?", "확인", "YesNo Icon?")
    if (result = "No") {
        return
    }
    
    global scriptLines := []
    global currentLineIndex := 1
    global scriptSearchResults := []
    global currentSearchIndex := 0
    scriptListView.Delete()
    
    if (IsObject(scriptSearchInput)) {
        scriptSearchInput.Text := ""
    }
    
    UpdateScriptStatus()
}

OpenScriptFile(*) {
    selectedFile := FileSelect(1, , "텍스트 파일 선택", "텍스트 파일 (*.txt)")
    if (!selectedFile) {
        return
    }
    
    if (scriptLines.Length > 0) {
        result := MsgBox("기존 대본을 교체하시겠습니까?", "확인", "YesNo Icon?")
        if (result = "No") {
            return
        }
    }
    
    try {
        fileContent := FileRead(selectedFile, "UTF-8")
        ProcessScriptText(fileContent)
        
        SplitPath(selectedFile, &fileName)
        ShowModernTooltip("파일 로드: " . fileName, 1500)
    } catch as err {
        MsgBox("파일을 읽는 중 오류가 발생했습니다.`n`n" . err.Message, "오류", "Icon!")
    }
}

UpdateScriptListView() {
    scriptListView.Delete()
    
    searchText := ""
    if (IsObject(scriptSearchInput) && scriptSearchInput.Text != "") {
        searchText := StrLower(Trim(scriptSearchInput.Text))
    }
    
    Loop scriptLines.Length {
        status := (A_Index = currentLineIndex) ? "▶" : "○"
        content := scriptLines[A_Index]
        
        if (searchText != "" && InStr(StrLower(content), searchText)) {
            content := "🔍 " . content
        }
        
        scriptListView.Add("", A_Index, status, content)
    }
    
    if (currentLineIndex > 0 && currentLineIndex <= scriptLines.Length) {
        scriptListView.Modify(currentLineIndex, "Select Focus Vis")
        
        if (currentLineIndex + 3 <= scriptLines.Length) {
            scriptListView.Modify(currentLineIndex + 3, "Vis")
        }
    }
    
    UpdateScriptPopupListView()
}

UpdateScriptStatus() {
    if (scriptMode) {
        if (scriptLines.Length > 0) {
            lblScriptStatus.Text := "대본 모드: ON (" . currentLineIndex . "/" . scriptLines.Length . ")"
        } else {
            lblScriptStatus.Text := "대본 모드: ON (대본 없음)"
        }
        lblScriptStatus.SetFont("s11 Bold c" . Format("{:06X}", VSColors.success), "Segoe UI")
    } else {
        lblScriptStatus.Text := "대본 모드: OFF"
        lblScriptStatus.SetFont("s11 Bold c" . Format("{:06X}", VSColors.text), "Segoe UI")
    }
    
    if (IsObject(scriptListView) && scriptListView.Hwnd && scriptLines.Length > 0) {
        scriptListView.Opt("-Redraw")
        
        scriptListView.Modify(0, "-Select")
        
        Loop scriptLines.Length {
            status := (A_Index = currentLineIndex) ? "▶" : "○"
            scriptListView.Modify(A_Index, "Col2", status)
        }
        
        if (currentLineIndex > 0 && currentLineIndex <= scriptLines.Length) {
            scriptListView.Modify(currentLineIndex, "Select Focus Vis")
            
            if (currentLineIndex + 3 <= scriptLines.Length) {
                scriptListView.Modify(currentLineIndex + 3, "Vis")
            }
        }
        
        scriptListView.Opt("+Redraw")
    }
    
    if (IsObject(scriptPopupListView) && scriptPopupListView.Hwnd && scriptLines.Length > 0) {
        scriptPopupListView.Opt("-Redraw")
        
        scriptPopupListView.Modify(0, "-Select")
        
        Loop scriptLines.Length {
            status := (A_Index = currentLineIndex) ? "▶" : "○"
            scriptPopupListView.Modify(A_Index, "Col2", status)
        }
        
        if (currentLineIndex > 0 && currentLineIndex <= scriptLines.Length) {
            scriptPopupListView.Modify(currentLineIndex, "Select Focus Vis")
            
            if (currentLineIndex + 3 <= scriptLines.Length) {
                scriptPopupListView.Modify(currentLineIndex + 3, "Vis")
            }
        }
        
        scriptPopupListView.Opt("+Redraw")
        
        if (IsObject(scriptPopupStatus) && scriptPopupStatus.Hwnd) {
            scriptPopupStatus.Text := "총 " . scriptLines.Length . "줄 | 현재: " . currentLineIndex . "줄"
        }
    }
}

ToggleScriptMode(*) {
    global scriptMode := !scriptMode
    UpdateScriptStatus()
    
    if (scriptMode) {
        ShowModernTooltip("대본 모드 ON", 1000)
    } else {
        ShowModernTooltip("대본 모드 OFF", 1000)
    }
}

SendScriptLine(*) {
    if (WinActive("ahk_id " . mainGui.Hwnd)) {
        return
    }
    
    if (!scriptMode) {
        return
    }
    
    if (scriptLines.Length = 0) {
        ShowModernTooltip("대본이 없습니다.", 1000)
        return
    }
    
    if (currentLineIndex > scriptLines.Length) {
        ShowModernTooltip("대본의 끝입니다.", 1000)
        return
    }
    
    textToSend := scriptLines[currentLineIndex]
    textToSend := StrReplace(textToSend, "`r", "")
    textToSend := StrReplace(textToSend, "`n", "")
    
    SendText(textToSend)
    
    if (scriptAutoNewline) {
        Send("{Enter}")
    }
    
    if (currentLineIndex < scriptLines.Length) {
        global currentLineIndex := currentLineIndex + 1
    } else {
        ShowModernTooltip("마지막 줄 송출 완료", 1500)
    }
    
    UpdateScriptStatus()
    
    if (IsObject(scriptListView) && scriptListView.Hwnd) {
        scriptListView.Modify(0, "-Select")
        scriptListView.Modify(currentLineIndex, "Select Focus Vis")
        
        if (currentLineIndex + 3 <= scriptLines.Length) {
            scriptListView.Modify(currentLineIndex + 3, "Vis")
        }
    }
    
    if (IsObject(scriptPopupListView) && scriptPopupListView.Hwnd) {
        scriptPopupListView.Modify(0, "-Select")
        scriptPopupListView.Modify(currentLineIndex, "Select Focus Vis")
        
        if (currentLineIndex + 3 <= scriptLines.Length) {
            scriptPopupListView.Modify(currentLineIndex + 3, "Vis")
        }
    }
}

PrevScriptLine(*) {
    if (WinActive("ahk_id " . mainGui.Hwnd)) {
        return
    }
    
    if (!scriptMode) {
        return
    }
    
    if (currentLineIndex <= 1) {
        ShowModernTooltip("첫 번째 줄입니다.", 1000)
        return
    }
    
    global currentLineIndex := currentLineIndex - 1
    
    ShowModernTooltip("이전 줄로: " . currentLineIndex . "/" . scriptLines.Length, 1000)
    
    UpdateScriptStatus()
    
    if (IsObject(scriptListView) && scriptListView.Hwnd) {
        scriptListView.Modify(0, "-Select")
        scriptListView.Modify(currentLineIndex, "Select Focus Vis")
        
        if (currentLineIndex + 3 <= scriptLines.Length) {
            scriptListView.Modify(currentLineIndex + 3, "Vis")
        }
    }
    
    if (IsObject(scriptPopupListView) && scriptPopupListView.Hwnd) {
        scriptPopupListView.Modify(0, "-Select")
        scriptPopupListView.Modify(currentLineIndex, "Select Focus Vis")
        
        if (currentLineIndex + 3 <= scriptLines.Length) {
            scriptPopupListView.Modify(currentLineIndex + 3, "Vis")
        }
    }
}

NextScriptLine(*) {
    if (WinActive("ahk_id " . mainGui.Hwnd)) {
        return
    }
    
    if (!scriptMode) {
        return
    }
    
    if (currentLineIndex >= scriptLines.Length) {
        ShowModernTooltip("마지막 줄입니다.", 1000)
        return
    }
    
    global currentLineIndex := currentLineIndex + 1
    
    ShowModernTooltip("다음 줄로: " . currentLineIndex . "/" . scriptLines.Length, 1000)
    
    UpdateScriptStatus()
    
    if (IsObject(scriptListView) && scriptListView.Hwnd) {
        scriptListView.Modify(0, "-Select")
        scriptListView.Modify(currentLineIndex, "Select Focus Vis")
        
        if (currentLineIndex + 3 <= scriptLines.Length) {
            scriptListView.Modify(currentLineIndex + 3, "Vis")
        }
    }
    
    if (IsObject(scriptPopupListView) && scriptPopupListView.Hwnd) {
        scriptPopupListView.Modify(0, "-Select")
        scriptPopupListView.Modify(currentLineIndex, "Select Focus Vis")
        
        if (currentLineIndex + 3 <= scriptLines.Length) {
            scriptPopupListView.Modify(currentLineIndex + 3, "Vis")
        }
    }
}

OnSplitMethodChange(*) {
    global scriptLines
    
    if (splitMethodDDL.Text != "사용자 지정" && customCharInput.Text != "") {
        customCharInput.Text := ""
    }
    
    if (splitMethodDDL.Text = "사용자 지정") {
        customCharInput.Focus()
    }
    
    if (scriptLines.Length > 0) {
        combinedText := ""
        for line in scriptLines {
            if (line != "") {
                if (combinedText != "") {
                    combinedText .= " " . line
                } else {
                    combinedText := line
                }
            }
        }
        
        if (combinedText != "") {
            ProcessScriptText(combinedText)
        }
    }
}

; ############################################
; #       화자 관리 함수                     #
; ############################################
AddSpeaker(*) {
    if (speakers.Length >= 9) {
        MsgBox("화자는 최대 9명까지만 추가할 수 있습니다.", "제한", "Icon!")
        return
    }
    
    ib := InputBox("화자 이름을 입력하세요:", "화자 추가", "w300 h120")
    if (ib.Result != "OK" || ib.Value = "") {
        return
    }
    
    newSpeaker := {
        name: ib.Value,
        number: speakers.Length + 1
    }
    
    speakers.Push(newSpeaker)
    UpdateSpeakerList()
    SaveSettings()
}

EditSpeaker(*) {
    selected := speakerListView.GetNext()
    if (!selected) {
        MsgBox("수정할 화자를 선택하세요.", "알림", "Icon!")
        return
    }
    
    currentName := speakers[selected].name
    ib := InputBox("새 이름을 입력하세요:", "화자 이름 수정", "w300 h120")
    ib.Value := currentName
    
    if (ib.Result = "OK" && ib.Value != "") {
        speakers[selected].name := ib.Value
        UpdateSpeakerList()
        
        speakerListView.Modify(selected, "Select Focus")
        
        SaveSettings()
    }
}

DeleteSpeaker(*) {
    selected := speakerListView.GetNext()
    if (!selected) {
        MsgBox("삭제할 화자를 선택하세요.", "알림", "Icon!")
        return
    }
    
    result := MsgBox("선택한 화자를 삭제하시겠습니까?", "확인", "YesNo Icon?")
    if (result = "No") {
        return
    }
    
    speakers.RemoveAt(selected)
    
    Loop speakers.Length {
        speakers[A_Index].number := A_Index
    }
    
    UpdateSpeakerList()
    SaveSettings()
}

ClearAllSpeakers(*) {
    if (speakers.Length = 0) {
        MsgBox("삭제할 화자가 없습니다.", "알림", "Icon!")
        return
    }
    
    result := MsgBox("모든 화자를 삭제하시겠습니까?", "경고", "YesNo Icon!")
    if (result = "No") {
        return
    }
    
    global speakers := []
    UpdateSpeakerList()
    SaveSettings()
}

MoveSpeakerUp(*) {
    selected := speakerListView.GetNext()
    if (!selected || selected = 1) {
        return
    }
    
    temp := speakers[selected]
    speakers[selected] := speakers[selected - 1]
    speakers[selected - 1] := temp
    
    Loop speakers.Length {
        speakers[A_Index].number := A_Index
    }
    
    UpdateSpeakerList()
    speakerListView.Modify(selected - 1, "Select Focus")
    SaveSettings()
}

MoveSpeakerDown(*) {
    selected := speakerListView.GetNext()
    if (!selected || selected = speakers.Length) {
        return
    }
    
    temp := speakers[selected]
    speakers[selected] := speakers[selected + 1]
    speakers[selected + 1] := temp
    
    Loop speakers.Length {
        speakers[A_Index].number := A_Index
    }
    
    UpdateSpeakerList()
    speakerListView.Modify(selected + 1, "Select Focus")
    SaveSettings()
}

UpdateSpeakerList() {
    speakerListView.Delete()
    
    circleNumbers := ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"]
    
    Loop speakers.Length {
        num := circleNumbers[A_Index]
        name := speakers[A_Index].name
        shortcut := "Insert+" . A_Index
        
        formatExample := speakerPrefix . name . speakerSuffix
        formatExample := StrReplace(formatExample, "`t", "→탭")
        
        if (speakerAutoNewline) {
            formatExample := "↵" . formatExample
        }
        
        speakerListView.Add("", num, name, shortcut, formatExample)
    }
    
    UpdateSpeakerPopupListView()
    UpdateStatusBar()
}

UpdateSpeakerFormat(*) {
    global speakerPrefix := edtPrefix.Text
    global speakerSuffix := edtSuffix.Text
    global speakerAutoNewline := chkAutoNewline.Value
    
    UpdateFormatPreview()
    UpdateSpeakerList()
    SaveSettings()
}

UpdateFormatPreview() {
    preview := speakerPrefix . "화자명" . speakerSuffix
    preview := StrReplace(preview, "`t", "→탭")
    if (speakerAutoNewline) {
        preview := "↵" . preview
    }
    lblFormatPreview.Text := preview
}

SetSpeakerFormat(prefix, suffix, newline) {
    edtPrefix.Text := prefix
    edtSuffix.Text := suffix
    chkAutoNewline.Value := newline
    UpdateSpeakerFormat()
}

; ############################################
; #       상용구 관리 함수                   #
; ############################################
AddPhrase(*) {
    text := phraseInput.Text
    if (!InStr(text, ":")) {
        return
    }
    
    parts := StrSplit(text, ":", , 2)
    if (parts.Length < 2 || Trim(parts[1]) = "" || Trim(parts[2]) = "") {
        return
    }
    
    key := Trim(parts[1])
    content := Trim(parts[2])
    
    isUpdate := phrases.Has(key)
    
    phrases[key] := {content: content, count: 0}
    phraseInput.Text := ""
    UpdatePhraseList()
    SaveSettings()
    
    if (isUpdate) {
        ShowModernTooltip("'" . key . "' 수정 완료", 1000)
    } else {
        ShowModernTooltip("'" . key . "' 등록 완료", 1000)
    }
    
    phraseInput.Focus()
}

EditPhrase(*) {
    selected := phraseListView.GetNext()
    if (!selected) {
        MsgBox("수정할 상용구를 선택하세요.", "알림", "Icon!")
        return
    }
    
    key := phraseListView.GetText(selected, 1)
    
    if (!phrases.Has(key)) {
        MsgBox("선택한 상용구를 찾을 수 없습니다.", "오류", "Icon!")
        return
    }
    
    currentData := phrases[key]
    currentContent := currentData.content
    currentCount := currentData.HasProp("count") ? currentData.count : 0
    
    ib := InputBox("새 내용을 입력하세요:`n`n현재: " . currentContent, "상용구 수정 - " . key, "w400 h120")
    
    if (ib.Result = "OK" && ib.Value != "") {
        phrases[key] := {content: ib.Value, count: currentCount}
        
        UpdatePhraseList()
        
        Loop phraseListView.GetCount() {
            if (phraseListView.GetText(A_Index, 1) = key) {
                phraseListView.Modify(A_Index, "Select Focus")
                break
            }
        }
        
        SaveSettings()
        
        if (chkShowTooltips.Value) {
            ShowModernTooltip("상용구 '" . key . "' 수정 완료", 1500)
        }
    }
}

DeletePhrase(*) {
    selected := phraseListView.GetNext()
    if (!selected) {
        MsgBox("삭제할 상용구를 선택하세요.", "알림", "Icon!")
        return
    }
    
    key := phraseListView.GetText(selected, 1)
    
    result := MsgBox("선택한 상용구를 삭제하시겠습니까?`n`n키: " . key, "확인", "YesNo Icon?")
    if (result = "No") {
        return
    }
    
    phrases.Delete(key)
    UpdatePhraseList()
    SaveSettings()
}

ClearAllPhrases(*) {
    if (phrases.Count = 0) {
        MsgBox("삭제할 상용구가 없습니다.", "알림", "Icon!")
        return
    }
    
    result := MsgBox("모든 상용구를 삭제하시겠습니까?", "경고", "YesNo Icon!")
    if (result = "No") {
        return
    }
    
    global phrases := Map()
    UpdatePhraseList()
    SaveSettings()
}

UpdatePhraseList() {
    phraseListView.Delete()
    
    for key, data in phrases {
        content := data.content
        count := data.HasProp("count") ? data.count : 0
        phraseListView.Add("", key, content, count)
    }
    
    UpdatePhrasePopupListView()
    UpdateStatusBar()
}

UpdatePhrasePreview(*) {
    text := phraseInput.Text
    if (InStr(text, ":")) {
        parts := StrSplit(text, ":", , 2)
        if (parts.Length >= 2) {
            phrasePreview.Text := Trim(parts[1]) . " → " . Trim(parts[2])
            return
        }
    }
    phrasePreview.Text := ""
}

ExportPhrases(*) {
    if (phrases.Count = 0) {
        MsgBox("내보낼 상용구가 없습니다.", "알림", "Icon!")
        return
    }
    
    selectedFile := FileSelect("S", "상용구_" . FormatTime(A_Now, "yyyyMMdd") . ".txt", "파일 저장", "텍스트 파일 (*.txt)")
    if (!selectedFile) {
        return
    }
    
    fileContent := ""
    for key, data in phrases {
        fileContent .= key . "`t" . data.content . "`n"
    }
    
    try {
        FileAppend(fileContent, selectedFile, "UTF-8")
        MsgBox("상용구를 성공적으로 내보냈습니다.`n`n파일: " . selectedFile, "성공", "Icon!")
    } catch as err {
        MsgBox("파일 저장 중 오류가 발생했습니다.", "오류", "Icon!")
    }
}

ImportPhrases(*) {
    selectedFile := FileSelect(1, , "텍스트 파일 선택", "텍스트 파일 (*.txt)")
    if (!selectedFile) {
        return
    }
    
    try {
        fileContent := FileRead(selectedFile, "UTF-8")
        lines := StrSplit(fileContent, "`n")
        
        importedCount := 0
        duplicateCount := 0
        
        for line in lines {
            line := Trim(line)
            if (line = "") {
                continue
            }
            
            tabPos := InStr(line, "`t")
            if (tabPos > 0) {
                key := SubStr(line, 1, tabPos - 1)
                content := SubStr(line, tabPos + 1)
            } else {
                spacePos := InStr(line, " ")
                if (spacePos > 0) {
                    key := SubStr(line, 1, spacePos - 1)
                    content := SubStr(line, spacePos + 1)
                } else {
                    continue
                }
            }
            
            if (key != "" && content != "") {
                if (phrases.Has(key)) {
                    duplicateCount := duplicateCount + 1
                }
                phrases[key] := {content: content, count: 0}
                importedCount := importedCount + 1
            }
        }
        
        UpdatePhraseList()
        SaveSettings()
        
        msg := importedCount . "개의 상용구를 불러왔습니다."
        if (duplicateCount > 0) {
            msg .= "`n(" . duplicateCount . "개는 기존 상용구를 덮어씀)"
        }
        MsgBox(msg, "성공", "Icon!")
        
    } catch as err {
        MsgBox("파일을 읽는 중 오류가 발생했습니다.`n`n" . err.Message, "오류", "Icon!")
    }
}

; ############################################
; #       핫키 설정 및 동작                  #
; ############################################
SetupHotkeys() {
    ; 스캔코드 매핑
    scanCodeMap := Map(
        "[", "SC01A",
        "]", "SC01B",
        ";", "SC027",
        "'", "SC028",
        ",", "SC033",
        ".", "SC034",
        "/", "SC035",
        "\", "SC02B",
        "-", "SC00C",
        "=", "SC00D",
        "``", "SC029"
    )
    
    ; F13~F21을 화자 1~9에 매핑
    Loop 9 {
        num := A_Index
        fkey := "F" . (12 + num)
        try {
            Hotkey(fkey, InsertSpeaker.Bind(num))
        } catch as err {
        }
    }
    
    ; 상용구 핫키 - 발동키
    try {
        if (scanCodeMap.Has(triggerKey)) {
            Hotkey(scanCodeMap[triggerKey], "Off")
        } else {
            Hotkey(triggerKey, "Off")
        }
    } catch {
    }
    
    hotkeyToSet := triggerKey
    if (scanCodeMap.Has(triggerKey)) {
        hotkeyToSet := scanCodeMap[triggerKey]
    }
    
    try {
        Hotkey(hotkeyToSet, TriggerPhrase)
    } catch as err {
        MsgBox("발동키(" . triggerKey . ") 설정 실패: " . err.Message, "오류", "Icon!")
    }
    
    ; 상용구 핫키 - 등록키
    try {
        if (scanCodeMap.Has(registerKey)) {
            Hotkey(scanCodeMap[registerKey], "Off")
        } else {
            Hotkey(registerKey, "Off")
        }
    } catch {
    }
    
    hotkeyToSet := registerKey
    if (scanCodeMap.Has(registerKey)) {
        hotkeyToSet := scanCodeMap[registerKey]
    }
    
    try {
        Hotkey(hotkeyToSet, RegisterPhraseFromEditor)
    } catch as err {
        MsgBox("등록키(" . registerKey . ") 설정 실패: " . err.Message, "오류", "Icon!")
    }
    
    ; 상용구 핫키 - 단어삭제키
    try {
        if (scanCodeMap.Has(deleteWordKey)) {
            Hotkey("*" . scanCodeMap[deleteWordKey], "Off")
        } else {
            Hotkey("*" . deleteWordKey, "Off")
        }
    } catch {
    }
    
    hotkeyToSet := deleteWordKey
    if (scanCodeMap.Has(deleteWordKey)) {
        hotkeyToSet := scanCodeMap[deleteWordKey]
    }
    
    try {
        Hotkey("*" . hotkeyToSet, DeleteWordBackward)
    } catch as err {
        MsgBox("단어삭제키(" . deleteWordKey . ") 설정 실패: " . err.Message, "오류", "Icon!")
    }
    
    ; F8 빠른 화자 등록
    try {
        Hotkey("F8", QuickAddSpeaker)
    }
    
    ; 대본 송출 핫키
    try {
        Hotkey("^Numpad7", ToggleScriptMode)
        Hotkey("^NumpadHome", ToggleScriptMode)
        Hotkey("^Numpad5", SendScriptLine)
        Hotkey("^NumpadClear", SendScriptLine)
        Hotkey("^Numpad8", PrevScriptLine)
        Hotkey("^NumpadUp", PrevScriptLine)
        Hotkey("^Numpad2", NextScriptLine)
        Hotkey("^NumpadDown", NextScriptLine)
        Hotkey("^Numpad9", ToggleScriptAutoNewline)
        Hotkey("^NumpadPgUp", ToggleScriptAutoNewline)
    }
    
    ; 대본 송출 탭에서만 동작하는 핫키
    HotIfWinActive("ahk_id " . mainGui.Hwnd)
    try {
        Hotkey("^v", OnPasteToScript)
        Hotkey("Enter", OnEnterInScriptTab)
        Hotkey("^f", OnSearchHotkey)
        Hotkey("Escape", OnEscapeInScriptTab)
    } catch as err {
    }
    HotIfWinActive()
}

CaptureKey(target) {
    global isCapturingKey := true
    global captureTarget := target
    
    global insert_pressed_time := 0
    
    Sleep(200)
    
    if (target = "trigger") {
        triggerKeyText.Text := "입력대기..."
        triggerKeyText.Opt("c" . Format("{:06X}", VSColors.warning))
    } else if (target = "register") {
        registerKeyText.Text := "입력대기..."
        registerKeyText.Opt("c" . Format("{:06X}", VSColors.warning))
    } else if (target = "deleteWord") {
        deleteWordKeyText.Text := "입력대기..."
        deleteWordKeyText.Opt("c" . Format("{:06X}", VSColors.warning))
    }
    
    SetTimer(CheckKeyPress, 50)
}

CheckKeyPress() {
    if (!isCapturingKey) {
        SetTimer(CheckKeyPress, 0)
        return
    }
    
    if (GetKeyState("LButton", "P") || GetKeyState("RButton", "P") || GetKeyState("MButton", "P")) {
        return
    }
    
    global insert_pressed_time := 0
    
    keys := []
    
    keys.Push("F1", "F2", "F3", "F4", "F5", "F6", "F7", "F9", "F10", "F11", "F12")
    keys.Push("A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M")
    keys.Push("N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z")
    keys.Push("Space", "Tab", "Home", "End", "PgUp", "PgDn", "Insert", "Delete")
    keys.Push("Up", "Down", "Left", "Right")
    keys.Push("Numpad0", "Numpad1", "Numpad2", "Numpad3", "Numpad4")
    keys.Push("Numpad5", "Numpad6", "Numpad7", "Numpad8", "Numpad9")
    keys.Push("NumpadAdd", "NumpadSub", "NumpadMult", "NumpadDiv")
    keys.Push("CapsLock", "ScrollLock", "Pause")
    keys.Push("-", "=", "[", "]", "\", ";", "'", ",", ".", "/", "``")
    keys.Push("1", "2", "3", "4", "5", "6", "7", "8", "9", "0")
    
    for key in keys {
        if (GetKeyState(key, "P")) {
            ; 숫자 키 체크를 안전하게 처리
            If (StrLen(key) = 1) {
                isDigit := false
                try {
                    ; 숫자인지 확인
                    if (key ~= "^[0-9]$") {
                        isDigit := true
                    }
                } catch {
                    isDigit := false
                }
                
                if (isDigit) {
                    global insert_pressed_time := 0
                    if (GetKeyState("Insert", "P")) {
                        continue
                    }
                }
            }
            CaptureComplete(key)
            return
        }
    }
    
    if (GetKeyState("Escape", "P")) {
        global isCapturingKey := false
        if (captureTarget = "trigger") {
            triggerKeyText.Text := triggerKey
            triggerKeyText.Opt("c" . Format("{:06X}", VSColors.accent))
        } else if (captureTarget = "register") {
            registerKeyText.Text := registerKey
            registerKeyText.Opt("c" . Format("{:06X}", VSColors.accent))
        } else if (captureTarget = "deleteWord") {
            deleteWordKeyText.Text := deleteWordKey
            deleteWordKeyText.Opt("c" . Format("{:06X}", VSColors.accent))
        }
        SetTimer(CheckKeyPress, 0)
    }
}

CaptureComplete(key) {
    global isCapturingKey := false
    
    ; 스캔코드 매핑 (특수 문자용)
    scanCodeMap := Map(
        "[", "SC01A",
        "]", "SC01B",
        ";", "SC027",
        "'", "SC028",
        ",", "SC033",
        ".", "SC034",
        "/", "SC035",
        "\", "SC02B",
        "-", "SC00C",
        "=", "SC00D",
        "``", "SC029"
    )
    
    problematicKeys := ["Tab", "Enter", "Shift", "Ctrl", "Alt", "LWin", "RWin", "Escape", "Insert", "F8", "Numpad2", "Numpad5", "Numpad7", "Numpad8", "Numpad9"]
    for pKey in problematicKeys {
        if (key = pKey) {
            msg := key . " 키는 "
            if (key = "F8") {
                msg .= "화자 등록 기능에 할당되어 있습니다."
            } else if (key = "Numpad2" || key = "Numpad5" || key = "Numpad7" || key = "Numpad8" || key = "Numpad9") {
                msg .= "대본 송출 기능에 할당되어 있습니다."
            } else {
                msg .= "시스템 키라서 사용할 수 없습니다."
            }
            MsgBox(msg, "경고", "Icon!")
            
            if (captureTarget = "trigger") {
                triggerKeyText.Text := triggerKey
                triggerKeyText.Opt("c" . Format("{:06X}", VSColors.accent))
            } else if (captureTarget = "register") {
                registerKeyText.Text := registerKey
                registerKeyText.Opt("c" . Format("{:06X}", VSColors.accent))
            } else if (captureTarget = "deleteWord") {
                deleteWordKeyText.Text := deleteWordKey
                deleteWordKeyText.Opt("c" . Format("{:06X}", VSColors.accent))
            }
            SetTimer(CheckKeyPress, 0)
            return
        }
    }
    
    ; 핫키 설정
    if (captureTarget = "trigger") {
        ; 기존 핫키 해제
        try {
            if (scanCodeMap.Has(triggerKey)) {
                Hotkey(scanCodeMap[triggerKey], "Off")
            } else {
                Hotkey(triggerKey, "Off")
            }
        } catch {
        }
        
        global triggerKey := key
        triggerKeyText.Text := key
        triggerKeyText.Opt("c" . Format("{:06X}", VSColors.accent))
        
        ; 새 핫키 설정
        hotkeyToSet := key
        if (scanCodeMap.Has(key)) {
            hotkeyToSet := scanCodeMap[key]
        }
        
        try {
            Hotkey(hotkeyToSet, TriggerPhrase)
        } catch as err {
            MsgBox("핫키 설정 실패: " . err.Message . "`n`n다른 키를 선택해주세요.", "오류", "Icon!")
            global triggerKey := "F3"
            triggerKeyText.Text := triggerKey
            Hotkey(triggerKey, TriggerPhrase)
        }
    } else if (captureTarget = "register") {
        try {
            if (scanCodeMap.Has(registerKey)) {
                Hotkey(scanCodeMap[registerKey], "Off")
            } else {
                Hotkey(registerKey, "Off")
            }
        } catch {
        }
        
        global registerKey := key
        registerKeyText.Text := key
        registerKeyText.Opt("c" . Format("{:06X}", VSColors.accent))
        
        hotkeyToSet := key
        if (scanCodeMap.Has(key)) {
            hotkeyToSet := scanCodeMap[key]
        }
        
        try {
            Hotkey(hotkeyToSet, RegisterPhraseFromEditor)
        } catch as err {
            MsgBox("핫키 설정 실패: " . err.Message . "`n`n다른 키를 선택해주세요.", "오류", "Icon!")
            global registerKey := "F10"
            registerKeyText.Text := registerKey
            Hotkey(registerKey, RegisterPhraseFromEditor)
        }
    } else if (captureTarget = "deleteWord") {
        try {
            if (scanCodeMap.Has(deleteWordKey)) {
                Hotkey("*" . scanCodeMap[deleteWordKey], "Off")
            } else {
                Hotkey("*" . deleteWordKey, "Off")
            }
        } catch {
        }
        
        global deleteWordKey := key
        deleteWordKeyText.Text := key
        deleteWordKeyText.Opt("c" . Format("{:06X}", VSColors.accent))
        
        hotkeyToSet := key
        if (scanCodeMap.Has(key)) {
            hotkeyToSet := scanCodeMap[key]
        }
        
        try {
            Hotkey("*" . hotkeyToSet, DeleteWordBackward)
        } catch as err {
            MsgBox("핫키 설정 실패: " . err.Message . "`n`n다른 키를 선택해주세요.", "오류", "Icon!")
            global deleteWordKey := "F4"
            deleteWordKeyText.Text := deleteWordKey
            Hotkey("*" . deleteWordKey, DeleteWordBackward)
        }
    }
    
    SetTimer(CheckKeyPress, 0)
    SaveSettings()
}

ResetHotkeys(*) {
    try {
        Hotkey(triggerKey, "Off")
    } catch {
    }
    try {
        Hotkey(registerKey, "Off")
    } catch {
    }
    try {
        Hotkey("*" . deleteWordKey, "Off")
    } catch {
    }
    
    global triggerKey := "F3"
    global registerKey := "F10"
    global deleteWordKey := "F4"
    
    triggerKeyText.Text := triggerKey
    registerKeyText.Text := registerKey
    deleteWordKeyText.Text := deleteWordKey
    
    SetupHotkeys()
    
    SaveSettings()
    
    ShowModernTooltip("단축키가 초기화되었습니다.", 1500)
}

; 대본 송출 탭 전용 핫키 함수들
OnPasteToScript(*) {
    try {
        focused := mainGui.FocusedCtrl
        if (focused = scriptListView || (IsObject(splitMethodDDL) && focused = splitMethodDDL)) {
            if (A_Clipboard != "") {
                ProcessScriptText(A_Clipboard)
            }
            return
        }
    }
    
    Send("^v")
}

OnEnterInScriptTab(*) {
    try {
        focused := mainGui.FocusedCtrl
        
        if (hiddenEdit.Visible) {
            FinishEditScriptLine()
            return
        }
        
        if (focused = scriptListView) {
            AddScriptLine()
            return
        }
        
        if (focused = customCharInput && customCharInput.Text != "") {
            OnSplitMethodChange()
            return
        }
        
        if (focused = scriptSearchInput) {
            SearchNext()
            return
        }
    }
    
    Send("{Enter}")
}

OnSearchHotkey(*) {
    if (tabControl.Value = 3) {
        scriptSearchInput.Focus()
        scriptSearchInput.Text := ""
        return
    }
    
    Send("^f")
}

OnEscapeInScriptTab(*) {
    try {
        focused := mainGui.FocusedCtrl
        
        if (focused = scriptSearchInput) {
            scriptSearchInput.Text := ""
            global scriptSearchResults := []
            global currentSearchIndex := 0
            UpdateScriptListView()
            scriptListView.Focus()
            return
        }
        
        if (hiddenEdit.Visible) {
            hiddenEdit.Visible := false
            hiddenEdit.Move(0, 0, 0, 0)
            global editingLineIndex := 0
            return
        }
    }
    
    Send("{Escape}")
}

SetupDeleteHotkey() {
    HotIfWinActive("ahk_id " . mainGui.Hwnd)
    Hotkey("Delete", DeleteSelected)
    Hotkey("NumpadDel", DeleteSelected)
    HotIfWinActive()
}

DeleteSelected(*) {
    if (!WinActive("ahk_id " . mainGui.Hwnd)) {
        return
    }
    
    try {
        focused := mainGui.FocusedCtrl
        
        if (focused = speakerListView) {
            selected := speakerListView.GetNext()
            if (selected) {
                DeleteSpeaker()
            }
            return
        }
        
        if (focused = phraseListView) {
            selected := phraseListView.GetNext()
            if (selected) {
                DeletePhrase()
            }
            return
        }
    } catch as err {
    }
}

; 핫키 동작 함수들
QuickAddSpeaker(*) {
    if (WinActive("ahk_id " . mainGui.Hwnd)) {
        return
    }
    
    if (speakers.Length >= 9) {
        ShowModernTooltip("화자는 최대 9명까지만 등록 가능합니다.", 2000)
        return
    }
    
    ClipSaved := ClipboardAll()
    A_Clipboard := ""
    
    Send("{Shift Down}{Home}{Shift Up}")
    Sleep(50)
    Send("^c")
    ClipWait(0.5)
    
    if (A_Clipboard = "") {
        A_Clipboard := ClipSaved
        Send("{Right}")
        return
    }
    
    textBeforeCursor := A_Clipboard
    Send("{Right}")
    Sleep(30)
    
    speakerName := Trim(textBeforeCursor)
    
    if (speakerName = "") {
        A_Clipboard := ClipSaved
        return
    }
    
    words := StrSplit(speakerName, " ")
    wordCount := 0
    for word in words {
        if (Trim(word) != "") {
            wordCount := wordCount + 1
        }
    }
    
    if (wordCount > 3) {
        ShowModernTooltip("화자명은 최대 3단어까지만 가능합니다.", 2000)
        A_Clipboard := ClipSaved
        return
    }
    
    newSpeaker := {
        name: speakerName,
        number: speakers.Length + 1
    }
    
    speakers.Push(newSpeaker)
    
    if (IsObject(mainGui) && IsObject(speakerListView)) {
        UpdateSpeakerList()
    }
    
    SaveSettings()
    
    circleNumbers := ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"]
    msg := circleNumbers[newSpeaker.number] . " " . speakerName . " 등록"
    msg .= " (Insert+" . newSpeaker.number . ")"
    
    ShowModernTooltip(msg, 1500)
    
    Loop StrLen(textBeforeCursor) {
        Send("{BS}")
    }
    
    Sleep(100)
    A_Clipboard := ClipSaved
    
    global insert_pressed_time := 0
}

DeleteWordBackward(*) {
    global isF4Processing, insert_pressed_time
    
    if (WinActive("ahk_id " . mainGui.Hwnd)) {
        Send("{" . deleteWordKey . "}")
        return
    }
    
    if (isF4Processing) {
        return
    }
    
    insert_pressed_time := 0
    isF4Processing := true
    
    if (GetKeyState("Ctrl", "P") || GetKeyState("Alt", "P") || GetKeyState("Shift", "P")) {
        Send("{" . deleteWordKey . "}")
        isF4Processing := false
        return
    }
    
    KeyWait(deleteWordKey)
    
    ; 빠른 방법: 단어 선택 후 삭제
    ClipSaved := ClipboardAll()
    A_Clipboard := ""
    
    ; Ctrl+Shift+Left로 단어 선택
    Send("^+{Left}")
    Sleep(20)
    Send("^c")
    ClipWait(0.1)
    
    selectedText := A_Clipboard
    
    ; 특수문자 하나만 선택됐으면 공백까지 더 선택
    if (selectedText ~= "^[^a-zA-Z0-9가-힣\s]$") {
        ; 공백 나올 때까지 왼쪽으로 더 선택
        Loop 20 {
            Send("+{Left}")
            Sleep(10)
            Send("^c")
            ClipWait(0.1)
            
            newText := A_Clipboard
            if (InStr(newText, " ")) {
                ; 공백 찾음, 공백 빼고 선택
                textLen := StrLen(newText)
                spacePos := InStr(newText, " ")
                if (spacePos = 1) {
                    ; 맨 앞이 공백이면 공백 제외
                    Send("+{Right}")
                }
                break
            }
        }
    }
    
    ; 선택된 부분 삭제
    Send("{Del}")
    
    A_Clipboard := ClipSaved
    
    global chkShowTooltips
    if (chkShowTooltips.Value) {
        ShowModernTooltip("단어 삭제", 800)
    }
    
    isF4Processing := false
}
QuickAddSpeakerFromInput(*) {
    if (speakers.Length >= 9) {
        ShowModernTooltip("화자는 최대 9명까지만 추가할 수 있습니다.", 2000)
        return
    }
    
    speakerName := Trim(speakerQuickInput.Text)
    if (speakerName = "") {
        return
    }
    
    newSpeaker := {
        name: speakerName,
        number: speakers.Length + 1
    }
    
    speakers.Push(newSpeaker)
    UpdateSpeakerList()
    SaveSettings()
    
    speakerQuickInput.Text := ""
    
    circleNumbers := ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"]
    ShowModernTooltip(circleNumbers[newSpeaker.number] . " " . speakerName . " 추가 완료", 1000)
    
    speakerQuickInput.Focus()
}

InsertSpeaker(num, *) {
    if (num > speakers.Length) {
        ShowModernTooltip("화자" . num . " 없음!", 1000)
        return
    }
    
    speakerName := speakers[num].name
    
    insertText := speakerPrefix . speakerName . speakerSuffix
    if (speakerAutoNewline) {
        insertText := "`n" . insertText
    }
    
    SendText(insertText)
    
    ShowModernTooltip("화자 삽입: " . speakerName, 1000)
}

TriggerPhrase(*) {
    if (WinActive("ahk_id " . mainGui.Hwnd)) {
        return
    }
    
    Sleep(20)
    
    ClipSaved := ClipboardAll()
    A_Clipboard := ""
    
    Send("^+{Left}")
    Sleep(20)
    Send("^c")
    
    if (!ClipWait(0.2)) {
        A_Clipboard := ClipSaved
        Send("{Right}")
        return
    }
    
    selectedWord := Trim(A_Clipboard)
    
    if (phrases.Has(selectedWord)) {
        Send("{Del}")
        Sleep(10)
        SendText(phrases[selectedWord].content)
        
        phrases[selectedWord].count := phrases[selectedWord].count + 1
        
        if (IsObject(mainGui) && mainGui.Hwnd) {
            try {
                UpdatePhraseList()
            }
        }
        
        if (chkShowTooltips.Value) {
            ShowModernTooltip("→ " . phrases[selectedWord].content, 800)
        }
    } else {
        Send("{Right}")
    }
    
    Sleep(30)
    A_Clipboard := ClipSaved
    
    global insert_pressed_time := 0
}

RegisterPhraseFromEditor(*) {
    if (WinActive("ahk_id " . mainGui.Hwnd)) {
        return
    }
    
    ClipSaved := ClipboardAll()
    A_Clipboard := ""
    
    Send("{Home}+{End}^c")
    ClipWait(0.2)
    
    if (A_Clipboard = "") {
        A_Clipboard := ClipSaved
        return
    }
    
    text := Trim(A_Clipboard)
    originalText := text  ; 원본 텍스트 저장
    
    lastColonPos := InStr(text, ":", , -1)
    if (lastColonPos = 0) {
        ShowModernTooltip("상용구 형식 오류 (예: 가:가나다)", 1500)
        A_Clipboard := ClipSaved
        return
    }
    
    beforeColon := SubStr(text, 1, lastColonPos - 1)
    afterColon := SubStr(text, lastColonPos + 1)
    
    beforeColon := Trim(beforeColon)
    lastSpacePos := InStr(beforeColon, " ", , -1)
    if (lastSpacePos > 0) {
        key := SubStr(beforeColon, lastSpacePos + 1)
    } else {
        key := beforeColon
    }
    key := Trim(key)
    
    if (key = "") {
        ShowModernTooltip("키를 입력해주세요", 1500)
        A_Clipboard := ClipSaved
        return
    }
    
    content := Trim(afterColon)
    
    if (key = "" || content = "") {
        ShowModernTooltip("키와 내용을 모두 입력해주세요", 1500)
        A_Clipboard := ClipSaved
        return
    }
    
 phrases[key] := {content: content, count: 0}
    
    ; [FIX] 줄 전체 삭제 대신 '키:내용' 구간만 제거하고 나머지 보존
    ; 이미 위에서 originalText(=Trim된 줄), lastColonPos, key, content를 계산함
    beforeColon := SubStr(originalText, 1, lastColonPos - 1)
    lastSpacePos := InStr(beforeColon, " ", , -1)      ; 콜론 앞 마지막 공백 위치
    
    ; 줄 처음부터 시작하는 경우와 중간에 있는 경우를 구분
    if (lastSpacePos = 0) {
        ; 줄 처음부터 시작하는 경우 - 줄 전체 삭제
        Send("{Home}+{End}")
        Sleep(10)
        Send("{Del}")
    } else {
        ; 중간에 있는 경우 - 앞부분과 공백 보존
        newLine := SubStr(originalText, 1, lastSpacePos)  ; 공백 포함해서 보존
        Send("{Home}+{End}")
        tmpSaved := ClipboardAll()
        A_Clipboard := newLine
        Sleep(10)
        Send("^v")
        Sleep(10)
        A_Clipboard := tmpSaved
    }
    
    UpdatePhraseList()
    SaveSettings()
    
    ShowModernTooltip("'" . key . "' 등록 완료!", 1500)
    
    Sleep(30)
    A_Clipboard := ClipSaved
    
    global insert_pressed_time := 0
}

; ############################################
; #       유틸리티 함수                     #
; ############################################
ShowModernTooltip(text, duration := 1000) {
    if (!WinActive("ahk_id " . mainGui.Hwnd)) {
        ToolTip(text)
        SetTimer(() => ToolTip(), -duration)
        return
    }
    
    ToolTip(text)
    SetTimer(() => ToolTip(), -duration)
    
    if (IsObject(statusText)) {
        statusText.Text := text
        SetTimer(() => UpdateStatusBar(), -duration)
    }
}

UpdateStatusBar(text := "Ready") {
    if (IsObject(statusText)) {
        statusText.Text := text
    }
    
    if (IsObject(speakerCountText)) {
        speakerCountText.Text := "화자: " . speakers.Length . "/9"
    }
    
    if (IsObject(phraseCountText)) {
        phraseCountText.Text := "상용구: " . phrases.Count . "개"
    }
}

; ############################################
; #       설정 저장/로드                     #
; ############################################
SaveSettings(*) {
    try {
        UpdateStatusBar("저장 중...")
        
        ; 화자 저장
        IniWrite(speakers.Length, settingsFile, "Speakers", "Count")
        Loop speakers.Length {
            IniWrite(speakers[A_Index].name, settingsFile, "Speakers", "Speaker" . A_Index)
        }
        
        ; 화자 형식 저장
        IniWrite(speakerPrefix, settingsFile, "SpeakerFormat", "Prefix")
        IniWrite(speakerSuffix, settingsFile, "SpeakerFormat", "Suffix")
        IniWrite(speakerAutoNewline, settingsFile, "SpeakerFormat", "AutoNewline")
        
        ; 상용구 저장
        phraseKeys := ""
        for key, data in phrases {
            phraseKeys .= key . "|"
            IniWrite(data.content, settingsFile, "Phrases", key)
            IniWrite(data.count, settingsFile, "PhraseCount", key)
        }
        IniWrite(phraseKeys, settingsFile, "Phrases", "Keys")
        
        ; 단축키 저장
        IniWrite(triggerKey, settingsFile, "Hotkeys", "TriggerKey")
        IniWrite(registerKey, settingsFile, "Hotkeys", "RegisterKey")
        IniWrite(deleteWordKey, settingsFile, "Hotkeys", "DeleteWordKey")
        
        ; 설정 저장
        if (IsObject(chkShowTooltips)) {
            IniWrite(chkShowTooltips.Value, settingsFile, "Settings", "ShowTooltips")
        }
        IniWrite(comboThreshold, settingsFile, "Settings", "ComboThreshold")
        
        ; 사용자 지정 글자수 저장
        if (IsObject(customCharInput) && customCharInput.Text != "") {
            IniWrite(customCharInput.Text, settingsFile, "Script", "CustomCharCount")
        }
        
        ; 구두점 추가 분할 옵션 저장
        if (IsObject(chkPunctuation)) {
            IniWrite(chkPunctuation.Value, settingsFile, "Script", "PunctuationSplit")
        }
        
        ; 대본 자동 줄바꿈 옵션 저장
        if (IsObject(chkScriptAutoNewline)) {
            IniWrite(chkScriptAutoNewline.Value, settingsFile, "Script", "ScriptAutoNewline")
        }
        
        ShowModernTooltip("설정이 저장되었습니다.", 1500)
        
    } catch as err {
        UpdateStatusBar("저장 실패")
        MsgBox("설정 저장 중 오류가 발생했습니다.`n`n" . err.Message, "오류", "Icon!")
    }
}

LoadSettings() {
    try {
        ; 화자 로드
        speakerCount := Integer(IniRead(settingsFile, "Speakers", "Count", 0))
        Loop speakerCount {
            name := IniRead(settingsFile, "Speakers", "Speaker" . A_Index, "화자" . A_Index)
            speakers.Push({name: name, number: A_Index})
        }
        
        ; 화자 형식 로드
        global speakerPrefix := IniRead(settingsFile, "SpeakerFormat", "Prefix", "-")
        global speakerSuffix := IniRead(settingsFile, "SpeakerFormat", "Suffix", ": ")
        global speakerAutoNewline := Integer(IniRead(settingsFile, "SpeakerFormat", "AutoNewline", 1))
        
        ; 상용구 로드
        phraseKeys := IniRead(settingsFile, "Phrases", "Keys", "")
        if (phraseKeys != "") {
            keys := StrSplit(phraseKeys, "|")
            for key in keys {
                if (key != "") {
                    content := IniRead(settingsFile, "Phrases", key, "")
                    count := Integer(IniRead(settingsFile, "PhraseCount", key, 0))
                    if (content != "") {
                        phrases[key] := {content: content, count: count}
                    }
                }
            }
        }
        
        ; 단축키 로드
        global triggerKey := IniRead(settingsFile, "Hotkeys", "TriggerKey", "F3")
        global registerKey := IniRead(settingsFile, "Hotkeys", "RegisterKey", "F10")
        global deleteWordKey := IniRead(settingsFile, "Hotkeys", "DeleteWordKey", "F4")
        
        ; 타이밍 설정 로드
        global comboThreshold := Integer(IniRead(settingsFile, "Settings", "ComboThreshold", 3000))
        
        ; 대본 자동 줄바꿈 로드
        global scriptAutoNewline := Integer(IniRead(settingsFile, "Script", "ScriptAutoNewline", 1))
        
        ; GUI가 생성된 후에 체크박스 값 로드
        SetTimer(() => LoadCheckboxValues(), -100)
        
    } catch as err {
    }
}

LoadCheckboxValues() {
    try {
        if (IsObject(chkShowTooltips)) {
            chkShowTooltips.Value := Integer(IniRead(settingsFile, "Settings", "ShowTooltips", 1))
        }
        if (IsObject(customCharInput)) {
            customCharInput.Text := IniRead(settingsFile, "Script", "CustomCharCount", "")
        }
        if (IsObject(chkPunctuation)) {
            chkPunctuation.Value := Integer(IniRead(settingsFile, "Script", "PunctuationSplit", 0))
        }
        if (IsObject(chkScriptAutoNewline)) {
            chkScriptAutoNewline.Value := Integer(IniRead(settingsFile, "Script", "ScriptAutoNewline", 1))
        }
    } catch as err {
    }
}

; ############################################
; #       트레이 아이콘 설정                 #
; ############################################
TraySetIcon("Shell32.dll", 264)
A_IconTip := "HanKey"

A_TrayMenu.Delete()
A_TrayMenu.Add("열기", (*) => mainGui.Show())
A_TrayMenu.Add()
A_TrayMenu.Add("화자 관리", (*) => ShowTab(1))
A_TrayMenu.Add("상용구 관리", (*) => ShowTab(2))
A_TrayMenu.Add("대본 송출", (*) => ShowTab(3))
A_TrayMenu.Add()
A_TrayMenu.Add("종료", (*) => ExitApp())
A_TrayMenu.Default := "열기"

ShowTab(tabNum) {
    mainGui.Show()
    if (IsObject(tabControl)) {
        tabControl.Choose(tabNum)
    }
}

OnMessage(0x203, OnTrayDoubleClick)

OnTrayDoubleClick(*) {
    mainGui.Show()
}

A_IconHidden := false

if (A_Args.Length > 0 && A_Args[1] = "/minimize") {
    mainGui.Hide()
}