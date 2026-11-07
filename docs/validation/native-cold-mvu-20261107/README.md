# Matrix native MVU send-time validation

If the original card variables, script enablement or source rules changed after prompt preparation, the matrix integration still sent its captured state. Four regressions reproduce the missing rejection. The host now rereads the native input immediately before final request assembly and rejects changes; it also rechecks preparation/chat/configuration after the await. The native event handler awaits this check so failures enter the existing payload blocker. The adapter never executes native updates.

Validation: 46 targeted tests and the full 1,418-test suite pass. Generated extension build is current. An actual Linux TauriTavern cold start retained the edited preset, selected output configuration, zero/false generation values, two swipes and independent branch data. The fixed bundle then delivered a 51-message request to the local fixture endpoint and rendered the next reply, leaving the main chat at 22 messages.

MVU drift cases use a simulated runtime; this isolated host has no active MVU card script. No real external provider or Android result is claimed. Private raw requests and native commands are in the same-identity state checkpoint.
