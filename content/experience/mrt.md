---
date: 2024-01-10
draft: false
title: "Flight Computer Software Lead"
jobTitle: "Flight Computer Software Lead"
company: "McGill Rocket Team"
location: "Montreal, Canada"
duration: "May 2024-Present"

---
# Flight Computer Software Lead
### About
The McGill Rocket Team (MRT) is a completely student run design team, focused on designing and launching a hybrid engine rocket. I joined the Flight Computer Software project in my first year at the university, and quickly gained an interest in the work. My first project was fixing a timing issue with an I2C bus. I then worked with another member to implement drivers for new acceleration, temperature, and pressure sensors. \
I was then elected by the team captains to become the new project lead in May 2024. Our planned launch was late August 2024 (at the [Launch Canada](https://www.launchcanada.org/) competition), and I worked throughout the summer to get the system ready for launch. In this time, I re-designed the system to use FreeRTOS and concurrent programming techniques (mutexes, queues, threads, etc.). I also implemented new commands to interface with the propulsion, radio, and payload systems over CAN buses, exhaustively tested a new SD card driver, and implemented a driver for a new video recorder inside the rocket. Although the rocket ultimately didn't fly (due to a faulty fuel valve), the software system worked throughout the testing and various launch attempts. After the competition, I designed the new software system architecture, trained new members, and managed my team of around 8-9 people. I hosted weekly meetings along with work sessions and social events such as hackathons and team wide BBQs.

### Skills Learned
C/C++, embedded systems, STM32 libraries, CppUTest. \
I had almost no experience writing C code before joining the team. However, I quickly developed a strong interest in C and embedded systems, completing the training documents in under a month (the rest of the team took nearly two and a half months). Throughout the year, I worked with interfacing with sensors over I2C, SPI, and UART, as well as other subsystems over the CAN bus. Additionally, I transitioned our sequential system to a concurrent one, utilizing the FreeRTOS framework and concurrent programming techniques. In terms of non-technical skills, I wrote documentation files, test reports, and design reports to the team. 

### Reflection
Overall, this is one of the most interesting experiences I've had and taught me a lot about hands on engineering work. My most important lesson comes from the night before our first launch where the video recorder would randomly turn off, and there just wasn't enough time in the morning to fix it. Ultimately, with time and energy I had left, I had to sacrifice the feature for that attempt (after the attempt failed I was able to fix it). I learned, once again, that not everything can be perfect and that's okay (although it's important that that critical system still works, which in this case, it did).
