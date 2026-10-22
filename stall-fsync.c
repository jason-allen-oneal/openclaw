#define _GNU_SOURCE
#include <dlfcn.h>
#include <fcntl.h>
#include <limits.h>
#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/syscall.h>
#include <time.h>
#include <unistd.h>

static atomic_int claimed = 0;
static int (*real_fsync)(int);
int fsync(int fd) {
  if (!real_fsync) real_fsync = dlsym(RTLD_NEXT, "fsync");
  const char *root = getenv("OPENCLAW_PROOF_FSYNC_ROOT");
  if (root && *root) {
    char descriptor[64], pathname[PATH_MAX], arm[PATH_MAX], release[PATH_MAX], trace[PATH_MAX];
    snprintf(descriptor, sizeof(descriptor), "/proc/self/fd/%d", fd);
    ssize_t size = readlink(descriptor, pathname, sizeof(pathname)-1);
    if (size > 0) {
      pathname[size] = 0;
      snprintf(arm, sizeof(arm), "%s/arm", root);
      snprintf(release, sizeof(release), "%s/release", root);
      snprintf(trace, sizeof(trace), "%s/native.jsonl", root);
      if (strstr(pathname, ".jsonl-stage") && access(arm, F_OK) == 0 && !atomic_exchange(&claimed, 1)) {
        int output = open(trace, O_WRONLY|O_CREAT|O_APPEND, 0600);
        struct timespec ts;
        clock_gettime(CLOCK_MONOTONIC, &ts);
        dprintf(output, "{\"event\":\"fsync-enter\",\"pid\":%d,\"tid\":%ld,\"fd\":%d,\"monotonic_ns\":%lld,\"path\":\"%s\"}\n", getpid(), syscall(SYS_gettid), fd, (long long)ts.tv_sec*1000000000+ts.tv_nsec, pathname);
        struct timespec pause = { .tv_sec=0, .tv_nsec=10000000 };
        while(access(release, F_OK) != 0) nanosleep(&pause, NULL);
        clock_gettime(CLOCK_MONOTONIC, &ts);
        dprintf(output, "{\"event\":\"fsync-released\",\"pid\":%d,\"tid\":%ld,\"monotonic_ns\":%lld}\n", getpid(), syscall(SYS_gettid), (long long)ts.tv_sec*1000000000+ts.tv_nsec);
        close(output);
      }
    }
  }
  return real_fsync(fd);
}
