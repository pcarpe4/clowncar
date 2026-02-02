FROM registry.k8s.io/coredns/coredns:v1.11.1 AS source
FROM registry.access.redhat.com/ubi9/ubi-minimal:latest AS builder
COPY --from=source /coredns /tmp/coredns-orig
RUN cat /tmp/coredns-orig > /tmp/coredns && chmod 755 /tmp/coredns

FROM registry.access.redhat.com/ubi9/ubi-micro:latest
COPY --from=builder /tmp/coredns /coredns
USER 1001
ENTRYPOINT ["/coredns"]