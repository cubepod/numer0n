/**
 * Numer0n - サイバー・ディメンション ゲームロジック
 * 
 * すべてのコメントは日本語で記述されています。
 * 変数名、関数名などは英語を維持しています。
 */

// ==========================================================================
// 1. サウンドエフェクトマネージャー (Web Audio API)
// ==========================================================================
class SoundManager {
    constructor() {
        this.ctx = null;
        this.muted = false;
    }

    // ブラウザの自動再生ポリシーに対応するための初期化
    initContext() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        return this.muted;
    }

    playOscillator(freqs, type, duration, sweep = false, sweepEndFreq = 0) {
        if (this.muted) return;
        this.initContext();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        
        freqs.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gainNode = this.ctx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, now);

            if (sweep && sweepEndFreq > 0) {
                osc.frequency.exponentialRampToValueAtTime(sweepEndFreq, now + duration);
            }

            // 音量フェードアウトでプチプチ音を防ぐ
            gainNode.gain.setValueAtTime(0.15, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

            osc.connect(gainNode);
            gainNode.connect(this.ctx.destination);

            osc.start(now + idx * 0.08);
            osc.stop(now + duration + idx * 0.08);
        });
    }

    playClick() {
        // 短い電子的なクリック音
        this.playOscillator([880], 'sine', 0.08);
    }

    playClear() {
        // キャンセル音 (下降)
        this.playOscillator([600], 'sine', 0.15, true, 300);
    }

    playAttack() {
        // チャージ音からレーザーアタック
        this.playOscillator([400], 'sawtooth', 0.4, true, 1200);
    }

    playEat() {
        // EAT用のポジティブなアルペジオ
        this.playOscillator([523.25, 659.25, 783.99], 'sine', 0.25);
    }

    playBite() {
        // BITE用の少し高めの単音
        this.playOscillator([587.33, 698.46], 'triangle', 0.2);
    }

    playWin() {
        // 勝利ファンファーレ
        const now = this.muted ? 0 : 0.1;
        this.playOscillator([523.25, 659.25, 783.99, 1046.5], 'sine', 0.6);
    }

    playLose() {
        // 敗北のディスコード音
        this.playOscillator([220, 207.65, 196], 'sawtooth', 0.8, true, 100);
    }
}

const sounds = new SoundManager();

// ==========================================================================
// 2. CPU推論AIクラス
// ==========================================================================
class CpuPlayer {
    constructor() {
        this.secret = '';
        this.candidates = [];
        this.reset();
    }

    reset() {
        this.secret = this.generateRandomSecret();
        this.candidates = this.generateAllCombinations();
    }

    // 0-9の重複しない3桁の組み合わせ（全720通り）を生成
    generateAllCombinations() {
        const list = [];
        for (let i = 0; i < 10; i++) {
            for (let j = 0; j < 10; j++) {
                if (i === j) continue;
                for (let k = 0; k < 10; k++) {
                    if (i === k || j === k) continue;
                    list.push(`${i}${j}${k}`);
                }
            }
        }
        return list;
    }

    // 重複のない3桁の数字をランダムに生成
    generateRandomSecret() {
        const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        let result = '';
        for (let i = 0; i < 3; i++) {
            const idx = Math.floor(Math.random() * digits.length);
            result += digits.splice(idx, 1)[0];
        }
        return result;
    }

    // 次の推測コールを実行
    makeGuess() {
        if (this.candidates.length === 0) {
            // 理論上あり得ないが、バグや不正入力への安全策
            return this.generateRandomSecret();
        }
        
        // 難易度調整や賢さの演出：
        // 候補リストからランダムに1つ選択する (これだけでも過去のEAT/BITE結果を完全に満たすため非常に賢い)
        const idx = Math.floor(Math.random() * this.candidates.length);
        return this.candidates[idx];
    }

    // プレイヤーからのアタック結果をフィードバックし、候補をフィルタリングする
    // guess: CPUがコールした数字, eat: プレイヤーから得られたEAT数, bite: BITE数
    feedback(guess, eat, bite) {
        const initialSize = this.candidates.length;
        
        this.candidates = this.candidates.filter(cand => {
            const res = GameLogic.calculateEatBite(cand, guess);
            return res.eat === eat && res.bite === bite;
        });

        console.log(`[CPU AI] 候補数を絞り込み: ${initialSize} -> ${this.candidates.length}`);
    }
}

// ==========================================================================
// 3. ゲームのユーティリティロジック
// ==========================================================================
const GameLogic = {
    // EATとBITEを計算するコアロジック
    calculateEatBite(secret, guess) {
        let eat = 0;
        let bite = 0;
        
        for (let i = 0; i < 3; i++) {
            if (guess[i] === secret[i]) {
                eat++;
            } else if (secret.includes(guess[i])) {
                bite++;
            }
        }
        
        return { eat, bite };
    },

    // 入力値が重複のない3桁の数字として妥当かチェック
    isValidNumber(numStr) {
        if (numStr.length !== 3) return false;
        if (!/^\d{3}$/.test(numStr)) return false;
        
        // 重複チェック
        const set = new Set(numStr);
        return set.size === 3;
    }
};

// ==========================================================================
// 4. アプリケーションステート & UIマネージャー
// ==========================================================================
class Numer0nApp {
    constructor() {
        this.cpu = new CpuPlayer();
        
        // ゲームステート
        this.gameMode = 'single'; // 'single' | 'vs'
        this.playerSecret = '';
        this.playerSetupDigits = []; // セットアップ画面の入力値
        this.playerGuessDigits = []; // プレイ画面の入力値
        
        this.playerTurns = 0;
        this.cpuTurns = 0;
        this.gameActive = false;
        
        this.startTime = null;
        this.timerInterval = null;

        // DOMの参照キャッシュ
        this.dom = {
            soundToggle: document.getElementById('sound-toggle'),
            ruleBtn: document.getElementById('rule-btn'),
            ruleModal: document.getElementById('rule-modal'),
            closeBtn: document.querySelector('.close-btn'),
            
            // 画面コンテナ
            setupScreen: document.getElementById('setup-screen'),
            gameScreen: document.getElementById('game-screen'),
            resultScreen: document.getElementById('result-screen'),
            
            // 設定画面
            modeSingle: document.getElementById('mode-single'),
            modeVs: document.getElementById('mode-vs'),
            playerSecretContainer: document.getElementById('player-secret-container'),
            startGameBtn: document.getElementById('start-game-btn'),
            setupKeypad: document.getElementById('setup-keypad'),
            
            // プレイ画面
            turnBadge: document.getElementById('turn-badge'),
            gameKeypad: document.getElementById('game-keypad'),
            gameAttackBtn: document.getElementById('game-attack'),
            playerStatusPanel: document.getElementById('player-status-panel'),
            playerSavedSecret: document.getElementById('player-saved-secret'),
            
            // ログ
            cpuLogColumn: document.getElementById('cpu-log-column'),
            playerLogList: document.getElementById('player-log-list'),
            cpuLogList: document.getElementById('cpu-log-list'),
            
            // AIアナリティクス
            aiAnalysisPanel: document.getElementById('ai-analysis-panel'),
            aiCandidateCount: document.getElementById('ai-candidate-count'),
            aiPercentage: document.getElementById('ai-percentage'),
            aiProgressFill: document.getElementById('ai-progress-fill'),
            aiThoughtText: document.getElementById('ai-thought-text'),
            
            // 結果画面
            resultTitle: document.getElementById('result-title'),
            resultSubtitle: document.getElementById('result-subtitle'),
            cpuSecretReveal: document.getElementById('cpu-secret-reveal'),
            playerSecretRevealBox: document.getElementById('player-secret-reveal-box'),
            playerSecretReveal: document.getElementById('player-secret-reveal'),
            statTurns: document.getElementById('stat-turns'),
            statTime: document.getElementById('stat-time'),
            restartBtn: document.getElementById('restart-btn')
        };

        this.initEvents();
    }

    initEvents() {
        // 音声トグル
        this.dom.soundToggle.addEventListener('click', () => {
            const isMuted = sounds.toggleMute();
            const icon = this.dom.soundToggle.querySelector('i');
            if (isMuted) {
                icon.className = 'fas fa-volume-mute';
                this.dom.soundToggle.style.color = 'var(--color-accent)';
            } else {
                icon.className = 'fas fa-volume-up';
                this.dom.soundToggle.style.color = '';
                sounds.playClick();
            }
        });

        // ルール説明モーダル
        this.dom.ruleBtn.addEventListener('click', () => {
            sounds.playClick();
            this.dom.ruleModal.classList.add('show');
        });
        
        const closeModal = () => {
            sounds.playClear();
            this.dom.ruleModal.classList.remove('show');
        };
        this.dom.closeBtn.addEventListener('click', closeModal);
        window.addEventListener('click', (e) => {
            if (e.target === this.dom.ruleModal) {
                closeModal();
            }
        });

        // モード選択
        this.dom.modeSingle.addEventListener('click', () => {
            sounds.playClick();
            this.setGameMode('single');
        });
        this.dom.modeVs.addEventListener('click', () => {
            sounds.playClick();
            this.setGameMode('vs');
        });

        // セットアップキーパッドのイベント委譲
        this.dom.setupKeypad.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            
            const val = btn.dataset.val;
            if (val !== undefined) {
                this.inputSetupDigit(val);
            } else if (btn.id === 'setup-clear') {
                this.clearSetupDigits();
            } else if (btn.id === 'setup-random') {
                this.randomizeSetupDigits();
            }
        });

        // ゲームキーパッドのイベント委譲
        this.dom.gameKeypad.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            
            const val = btn.dataset.val;
            if (val !== undefined) {
                this.inputGameDigit(val);
            } else if (btn.id === 'game-clear') {
                this.clearGameDigits();
            } else if (btn.id === 'game-attack') {
                this.executePlayerAttack();
            }
        });

        // スタート・リスタートボタン
        this.dom.startGameBtn.addEventListener('click', () => this.startGame());
        this.dom.restartBtn.addEventListener('click', () => this.showSetupScreen());
    }

    // モード切替時の画面調整
    setGameMode(mode) {
        this.gameMode = mode;
        if (mode === 'single') {
            this.dom.modeSingle.classList.add('active');
            this.dom.modeVs.classList.remove('active');
            this.dom.playerSecretContainer.style.display = 'none';
        } else {
            this.dom.modeSingle.classList.remove('active');
            this.dom.modeVs.classList.add('active');
            this.dom.playerSecretContainer.style.display = 'block';
            this.clearSetupDigits();
        }
    }

    // ==========================================================================
    // セットアップ画面の入力ロジック
    // ==========================================================================
    inputSetupDigit(digit) {
        if (this.playerSetupDigits.length >= 3) return;
        if (this.playerSetupDigits.includes(digit)) {
            sounds.playOscillator([150], 'sawtooth', 0.15); // 重複時のエラー音
            return;
        }

        sounds.playClick();
        this.playerSetupDigits.push(digit);
        this.updateSetupDisplay();
    }

    clearSetupDigits() {
        sounds.playClear();
        this.playerSetupDigits = [];
        this.updateSetupDisplay();
    }

    randomizeSetupDigits() {
        sounds.playClick();
        const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        this.playerSetupDigits = [];
        for (let i = 0; i < 3; i++) {
            const idx = Math.floor(Math.random() * digits.length);
            this.playerSetupDigits.push(digits.splice(idx, 1)[0]);
        }
        this.updateSetupDisplay();
    }

    updateSetupDisplay() {
        for (let i = 0; i < 3; i++) {
            const slot = document.getElementById(`secret-slot-${i}`);
            const val = this.playerSetupDigits[i];
            if (val !== undefined) {
                slot.textContent = val;
                slot.classList.add('filled');
            } else {
                slot.textContent = '-';
                slot.classList.remove('filled');
            }
        }

        // キーパッドの重複数字ボタンを非活性化
        const buttons = this.dom.setupKeypad.querySelectorAll('.key-btn[data-val]');
        buttons.forEach(btn => {
            btn.disabled = this.playerSetupDigits.includes(btn.dataset.val);
        });
    }

    // ==========================================================================
    // ゲーム画面の入力ロジック
    // ==========================================================================
    inputGameDigit(digit) {
        if (this.playerGuessDigits.length >= 3) return;
        if (this.playerGuessDigits.includes(digit)) {
            sounds.playOscillator([150], 'sawtooth', 0.15);
            return;
        }

        sounds.playClick();
        this.playerGuessDigits.push(digit);
        this.updateGameDisplay();
    }

    clearGameDigits() {
        sounds.playClear();
        this.playerGuessDigits = [];
        this.updateGameDisplay();
    }

    updateGameDisplay() {
        for (let i = 0; i < 3; i++) {
            const slot = document.getElementById(`guess-slot-${i}`);
            const val = this.playerGuessDigits[i];
            if (val !== undefined) {
                slot.textContent = val;
                slot.classList.add('filled');
            } else {
                slot.textContent = '-';
                slot.classList.remove('filled');
            }
        }

        // アタックキーパッドの重複無効化
        const buttons = this.dom.gameKeypad.querySelectorAll('.key-btn[data-val]');
        buttons.forEach(btn => {
            btn.disabled = this.playerGuessDigits.includes(btn.dataset.val);
        });

        // 3桁揃った場合のみアタックボタンを有効化
        this.dom.gameAttackBtn.disabled = this.playerGuessDigits.length !== 3;
    }

    // ==========================================================================
    // ゲーム開始処理
    // ==========================================================================
    startGame() {
        sounds.playClick();

        if (this.gameMode === 'vs') {
            const secretStr = this.playerSetupDigits.join('');
            if (!GameLogic.isValidNumber(secretStr)) {
                alert('秘密の数字を3桁入力してください。');
                return;
            }
            this.playerSecret = secretStr;
            this.dom.playerSavedSecret.textContent = secretStr;
            this.dom.playerStatusPanel.style.display = 'block';
            this.dom.cpuLogColumn.style.display = 'block';
            this.dom.aiAnalysisPanel.style.display = 'block';
            
            // VSモード用のCSSクラスを追加
            this.dom.gameScreen.querySelector('.game-layout').classList.add('vs-mode-layout');
        } else {
            this.playerSecret = '';
            this.dom.playerStatusPanel.style.display = 'none';
            this.dom.cpuLogColumn.style.display = 'none';
            this.dom.aiAnalysisPanel.style.display = 'none';
            
            this.dom.gameScreen.querySelector('.game-layout').classList.remove('vs-mode-layout');
        }

        // CPUリセット
        this.cpu.reset();
        
        // ターン初期化
        this.playerTurns = 0;
        this.cpuTurns = 0;
        this.gameActive = true;
        this.startTime = Date.now();

        // ログエリア初期化
        this.dom.playerLogList.innerHTML = '';
        this.dom.cpuLogList.innerHTML = '';

        // 入力クリア
        this.clearGameDigits();

        // AIパネル初期化
        if (this.gameMode === 'vs') {
            this.updateAiAnalysisPanel(720, '「解析準備完了。最初の推測パターンを生成します。」');
        }

        // 画面遷移
        this.showScreen('game-screen');
        
        // プレイヤー先手
        this.setTurn('player');
    }

    setTurn(turn) {
        this.turn = turn;
        if (turn === 'player') {
            this.dom.turnBadge.textContent = 'YOUR TURN';
            this.dom.turnBadge.className = 'turn-indicator active';
            this.setKeypadDisabled(false);
        } else {
            this.dom.turnBadge.textContent = 'CPU TURN';
            this.dom.turnBadge.className = 'turn-indicator cpu-active';
            this.setKeypadDisabled(true);
            
            // CPUの思考演出を挟んで実行
            setTimeout(() => this.executeCpuAttack(), 1500);
        }
    }

    setKeypadDisabled(disabled) {
        const buttons = this.dom.gameKeypad.querySelectorAll('.key-btn');
        buttons.forEach(btn => {
            if (btn.id === 'game-attack') {
                btn.disabled = disabled || this.playerGuessDigits.length !== 3;
            } else {
                btn.disabled = disabled || (btn.dataset.val && this.playerGuessDigits.includes(btn.dataset.val));
            }
        });
    }

    // ==========================================================================
    // プレイヤーの攻撃実行
    // ==========================================================================
    executePlayerAttack() {
        if (!this.gameActive || this.turn !== 'player') return;
        
        const guessStr = this.playerGuessDigits.join('');
        if (!GameLogic.isValidNumber(guessStr)) return;

        this.playerTurns++;
        sounds.playAttack();

        // 判定
        const result = GameLogic.calculateEatBite(this.cpu.secret, guessStr);
        
        // ログ追加
        this.addLogItem('player', this.playerTurns, guessStr, result);

        // 入力リセット
        this.clearGameDigits();

        // 効果音
        setTimeout(() => {
            if (result.eat === 3) {
                this.endGame('victory');
            } else {
                if (result.eat > 0) {
                    sounds.playEat();
                } else if (result.bite > 0) {
                    sounds.playBite();
                } else {
                    sounds.playOscillator([300], 'sine', 0.15); // EAT, BITE なし (ノーヒット)
                }

                if (this.gameMode === 'vs') {
                    this.setTurn('cpu');
                } else {
                    this.setTurn('player');
                }
            }
        }, 300);
    }

    // ==========================================================================
    // CPUの攻撃実行（推論AI駆動）
    // ==========================================================================
    executeCpuAttack() {
        if (!this.gameActive || this.turn !== 'cpu') return;

        this.cpuTurns++;
        
        // AIが次のコールを決定
        const guess = this.cpu.makeGuess();
        
        sounds.playAttack();

        // 判定
        const result = GameLogic.calculateEatBite(this.playerSecret, guess);
        
        // ログ追加
        this.addLogItem('cpu', this.cpuTurns, guess, result);

        // AIのフィルタリング（フィードバック）
        this.cpu.feedback(guess, result.eat, result.bite);

        // AI思考ログの文言生成
        const remain = this.cpu.candidates.length;
        let thought = '';
        if (result.eat === 3) {
            thought = `「完全解読に成功。答えは ${guess} です。」`;
        } else if (remain <= 1) {
            thought = `「解析完了。標的のシグナルを残り1通りに特定しました。」`;
        } else if (remain < 10) {
            thought = `「高精度特定モード。可能性は極めて低く、残り ${remain} 通りです。」`;
        } else if (result.eat > 0 || result.bite > 0) {
            thought = `「${guess} に対し ${result.eat} EAT, ${result.bite} BITE を検知。ノイズを除去中。」`;
        } else {
            thought = `「ノーヒット判定。候補群から ${guess} に関連する数値を一括排除します。」`;
        }

        this.updateAiAnalysisPanel(remain, thought);

        // 勝敗判定とターン切り替え
        setTimeout(() => {
            if (result.eat === 3) {
                this.endGame('defeat');
            } else {
                if (result.eat > 0) {
                    sounds.playEat();
                } else if (result.bite > 0) {
                    sounds.playBite();
                } else {
                    sounds.playOscillator([300], 'sine', 0.15);
                }
                
                this.setTurn('player');
            }
        }, 300);
    }

    // AI解析状況の更新
    updateAiAnalysisPanel(candidateCount, thoughtText) {
        this.dom.aiCandidateCount.textContent = candidateCount;
        
        const total = 720;
        const percentage = Math.round((candidateCount / total) * 100);
        this.dom.aiPercentage.textContent = `${percentage}%`;
        
        // プログレスバー（減るほど解析が進んだとみなすため、100 - 残り割合 とする）
        const progress = 100 - percentage;
        this.dom.aiProgressFill.style.width = `${progress}%`;
        this.dom.aiThoughtText.textContent = thoughtText;
    }

    // ログにアイテムを追加
    addLogItem(type, turn, guess, result) {
        const list = type === 'player' ? this.dom.playerLogList : this.dom.cpuLogList;
        
        // 最初の空メッセージを消す
        const emptyMsg = list.querySelector('.empty-log');
        if (emptyMsg) emptyMsg.remove();

        const item = document.createElement('div');
        item.className = 'log-item';
        
        item.innerHTML = `
            <span class="log-turn">T-${turn}</span>
            <span class="log-guess">${guess}</span>
            <div class="log-result">
                <span class="badge eat">${result.eat} EAT</span>
                <span class="badge bite">${result.bite} BITE</span>
            </div>
        `;
        
        list.appendChild(item);
        list.scrollTop = list.scrollHeight;
    }

    // ==========================================================================
    // ゲーム終了処理
    // ==========================================================================
    endGame(outcome) {
        this.gameActive = false;
        
        // タイマー停止
        const playTimeSec = Math.floor((Date.now() - this.startTime) / 1000);
        const minutes = Math.floor(playTimeSec / 60);
        const seconds = playTimeSec % 60;
        const timeStr = `${minutes}分${seconds}秒`;

        // 結果設定
        if (outcome === 'victory') {
            this.dom.resultScreen.querySelector('.result-panel').className = 'panel glass-panel result-panel victory';
            this.dom.resultTitle.textContent = 'VICTORY';
            this.dom.resultSubtitle.textContent = 'CPUの防御コードの完全解読に成功しました！';
            sounds.playWin();
        } else {
            this.dom.resultScreen.querySelector('.result-panel').className = 'panel glass-panel result-panel defeat';
            this.dom.resultTitle.textContent = 'DEFEAT';
            this.dom.resultSubtitle.textContent = 'CPUに先を越され、あなたの暗号は解読されました。';
            sounds.playLose();
        }

        // 開示情報
        this.dom.cpuSecretReveal.textContent = this.cpu.secret;
        if (this.gameMode === 'vs') {
            this.dom.playerSecretReveal.textContent = this.playerSecret;
            this.dom.playerSecretRevealBox.style.display = 'flex';
            this.dom.statTurns.textContent = `${this.playerTurns}手`;
        } else {
            this.dom.playerSecretRevealBox.style.display = 'none';
            this.dom.statTurns.textContent = `${this.playerTurns}手`;
        }

        this.dom.statTime.textContent = timeStr;

        // 画面遷移
        this.showScreen('result-screen');
    }

    // ==========================================================================
    // 画面切り替えのユーティリティ
    // ==========================================================================
    showScreen(screenId) {
        const screens = [this.dom.setupScreen, this.dom.gameScreen, this.dom.resultScreen];
        screens.forEach(screen => {
            if (screen.id === screenId) {
                screen.style.display = 'block';
                // 少し時間差で active を付与してトランジションを効かせる
                setTimeout(() => screen.classList.add('active'), 50);
            } else {
                screen.classList.remove('active');
                screen.style.display = 'none';
            }
        });
    }

    showSetupScreen() {
        sounds.playClick();
        this.playerSetupDigits = [];
        this.updateSetupDisplay();
        this.showScreen('setup-screen');
    }
}

// ページロード完了時に起動
document.addEventListener('DOMContentLoaded', () => {
    window.app = new Numer0nApp();
});
