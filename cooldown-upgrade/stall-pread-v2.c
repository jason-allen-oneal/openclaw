#define _GNU_SOURCE
#include <dlfcn.h>
#include <fcntl.h>
#include <limits.h>
#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/syscall.h>
#include <time.h>
#include <unistd.h>
static atomic_int claimed = 0;
ssize_t pread64(int fd, void *buffer, size_t count, off64_t offset) {
  static ssize_t (*real_pread)(int,void*,size_t,off64_t);
  if(!real_pread)real_pread=dlsym(RTLD_NEXT,"pread64");
  const char *root=getenv("OPENCLAW_PROOF_PREAD_ROOT");
  if(root && *root){
    char name[16]={0}; prctl(PR_GET_NAME,name,0,0,0);
    if(strcmp(name,"openclaw-rc")==0){
      char descriptor[64], pathname[PATH_MAX], arm[PATH_MAX], release[PATH_MAX], trace[PATH_MAX];
      snprintf(descriptor,sizeof(descriptor),"/proc/self/fd/%d",fd);
      ssize_t size=readlink(descriptor,pathname,sizeof(pathname)-1);
      if(size>0){
        pathname[size]=0;
        snprintf(arm,sizeof(arm),"%s/arm-reconcile",root);
        snprintf(release,sizeof(release),"%s/release-reconcile",root);
        snprintf(trace,sizeof(trace),"%s/native-reconcile.jsonl",root);
        if(strstr(pathname,"agents/main/agent/openclaw-agent.sqlite") && access(arm,F_OK)==0 && !atomic_exchange(&claimed,1)){
          int out=open(trace,O_WRONLY|O_CREAT|O_APPEND,0600);
          struct timespec ts; clock_gettime(CLOCK_MONOTONIC,&ts);
          dprintf(out,"{\"event\":\"sqlite-pread-enter\",\"pid\":%d,\"tid\":%ld,\"fd\":%d,\"path\":\"%s\",\"monotonic_ns\":%lld}\n",getpid(),syscall(SYS_gettid),fd,pathname,(long long)ts.tv_sec*1000000000+ts.tv_nsec);
          struct timespec pause={.tv_sec=0,.tv_nsec=10000000};
          while(access(release,F_OK)!=0)nanosleep(&pause,NULL);
          clock_gettime(CLOCK_MONOTONIC,&ts);
          dprintf(out,"{\"event\":\"sqlite-pread-release\",\"pid\":%d,\"tid\":%ld,\"monotonic_ns\":%lld}\n",getpid(),syscall(SYS_gettid),(long long)ts.tv_sec*1000000000+ts.tv_nsec);close(out);
        }
      }
    }
  }
  return real_pread(fd,buffer,count,offset);
}
