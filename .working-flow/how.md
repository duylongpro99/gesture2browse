Phase 1 chạy bằng bốn loại prompt lặp lại, không phải mỗi session một prompt mới. Bạn viết rất ít mỗi lần, vì CLAUDE.md §0 đã dặn Claude đọc STATUS và plan trước.

Bốn prompt lặp lại

1. Mở milestone (một lần cho mỗi 1A, 1B, 1C, 1D.x, 1E). Điều kiện: plan inputs của milestone đã có trong roadmap §8. Chạy trong plan mode.

Plan milestone 1A. Claim its row in docs/STATUS.md as "s-1A".
Read the 1A row in docs/05-roadmap.md §4.1 and its plan inputs in §8 (G1, G5, G8).
Write docs/plans/1A-vertical-slice.md in CLAUDE.md §1 form: placement, boundary check
against .claude/rules, interfaces fixed here (GestureFrame, Intent, PageCommand,
PageEvent, FSM state tree), principle check, tests. Split into the 3–4 sessions the
roadmap names, each with its own verification. Stop after writing the plan; do not code.

Bạn đọc plan, sửa nếu cần, rồi mới cho code. Đây là chỗ duy nhất bạn phải đọc kỹ, vì các session sau không được mở lại placement hay interface.

2. Session làm việc (lặp cho mỗi hàng trong plan).

Continue milestone 1A, session 2 in docs/plans/1A-vertical-slice.md.
Do only that session's scope. Run tsc, lint, boundary check, unit tests.
At the end update your row in docs/STATUS.md and the plan's ## Status.

Với session đầu của 1A, thêm một câu: "This slice is the golden path; later milestones imitate it, so prefer the plain conforming shape over anything clever."

3. Phản hồi tuning (từ 1B trở đi, hằng ngày). Đây là prompt quan trọng nhất và cũng là chỗ dễ sai nhất. Roadmap §7 yêu cầu số, không phải cảm giác. Luôn kèm export từ diagnostics của 1D.5, vì thế 1D.5 phải xong trước vòng tuning.

Live-camera report, 1B. Diagnostics export attached: fixtures/diag/2026-09-20-a.json.
Observed: p95 pointer lag 140 ms at min_cutoff 1.0; 3 false pinch fires in 10 min,
all while hand exits frame. Propose a threshold change, replay the fixture suite,
show before/after precision/recall. Do not merge if any fixture regresses.

4. Đóng milestone.

Close milestone 1B. Check every exit criterion in roadmap §4.2 against evidence
(test output, CI, replay table). List proposed decisions for §8 in the plan's ## Status.
Remove the 1B row from docs/STATUS.md. Do not edit roadmap §8; I will.

Sau đó bạn tự ghi quyết định vào §8. Đây là bước tay duy nhất, và nó giữ cho decision log là của bạn.

Điểm riêng theo milestone

- 1A: không cần G3, G4, G6. Có thể bắt đầu ngay khi 0A xong và G5 có kết quả. Làm tuần tự một session, chưa song song.
- 1B và 1C song song sau khi 1A merge, vì chúng chạm thư mục khác nhau. Mở hai terminal, mỗi cái EnterWorktree rồi prompt loại 1 với milestone khác nhau. STATUS sẽ có hai hàng, mỗi session sửa hàng của mình. 1C cần G6, nếu G6 chưa có thì 1C chờ.
- 1D.x, mỗi màn hình một milestone. Prompt loại 1 thay bằng spec của bạn, hai đến ba câu:

Plan and build 1D.2 Calibration. Intent: the user adjusts pinch threshold, filter
smoothing and cursor gain while watching a live preview, and can reset to profile
defaults. Expose only the tunables named in docs/plans/1B and 1C. Output a Playwright
screenshot for me to review before wiring storage.
Thứ tự: 1D.5 trước, rồi 1D.1 đến 1D.4 xen kẽ với tuning, 1D.6 cuối.
- 1E: bạn quay y4m trước, rồi prompt "Wire e2e on fixtures/gestures/*.y4m, add perf CI thresholds from docs/spike-results.md." Fix từ study đưa vào bằng prompt loại 3.

Ba tình huống ngoài vòng lặp

- Claude đề xuất deviation. Nó phải dừng với ADR draft ở docs/adr/. Bạn trả lời "accept ADR 0003, continue" hoặc "reject, do X instead". Không bao giờ nói "cứ làm tạm".
- Phải mở lại interface đã chốt ở 1A. Không sửa trong session làm việc. Prompt: "Re-plan 1C: PageCommand needs a frameId field. Update protocol first, list every consumer, log the reason as a proposed decision." Rồi bạn ghi vào §8.
- Session mới không biết đang ở đâu. Chỉ cần gõ "Read docs/STATUS.md and tell me what you would do next." Nếu câu trả lời sai, STATUS đang sai, sửa STATUS chứ không sửa prompt.

Tổng cộng Phase 1 là khoảng 10 prompt loại 1, 30 đến 36 prompt loại 2, khoảng 10 prompt loại 3, và 10 prompt loại 4, khớp với ước lượng 28 đến 36 session trong roadmap.
