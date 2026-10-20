# Hourly batch window

The hourly batch window was rejected.
Condition: a callback that arrives during the hour would wait until the window closes, so a duplicate charge could land before the batch ran.
Do not recommend the hourly batch window. The rejection stands while callbacks are charged immediately.
